/**
 * Orphan reconciliation for the PRIVATE Vercel Blob store
 * (`registration-receiptsregistratio` — RegistrationFile + PhaseReceipt).
 *
 * WHY THIS EXISTS
 * ---------------
 * The nightly cron (/api/cron/cleanup-orphan-receipts) only deletes blobs it
 * still has a DB row for (RegistrationFile.registrationId = null /
 * PhaseReceipt.selection = null, older than 24h). It has a blind spot: when an
 * Event / Registration / FormField is deleted, Prisma cascades remove the
 * RegistrationFile / PhaseReceipt *rows* but DO NOT touch the bytes in Vercel
 * Blob. Those blobs then sit in the store forever, invisible to the cron. Over
 * time they fill the store (this is what pushed the store to 1 GB and started
 * 400-ing uploads with "Storage quota exceeded").
 *
 * This script reconciles in BOTH directions:
 *   Pass A (DB-led)   — the cron's own logic, run on demand: delete old
 *                       unlinked rows + their blobs.
 *   Pass B (store-led) — list every blob in the store and delete the ones no
 *                       DB row references at all (the cascade-orphan blind
 *                       spot). Only blobs older than the grace window are
 *                       touched, so an in-flight upload whose webhook hasn't
 *                       written its row yet is never deleted.
 *
 * SAFETY
 * ------
 *   - Dry run by DEFAULT. Nothing is deleted unless you pass --apply.
 *   - The Blob token (.env.local BLOB_READ_WRITE_TOKEN) and the DB
 *     (.env DATABASE_URL) MUST point at the SAME environment (production).
 *     If they don't, Pass B would treat real files as orphans. The wrong-DB
 *     guard below aborts if the DB reports zero referenced blobs while the
 *     store is non-empty.
 *   - Passing the token explicitly to list()/del() avoids the SDK silently
 *     picking up the wrong store token (two stores exist in this project).
 *
 * USAGE
 *   npx tsx prisma/scripts/cleanup-orphan-blobs.ts                 # dry run
 *   npx tsx prisma/scripts/cleanup-orphan-blobs.ts --apply         # delete
 *   npx tsx prisma/scripts/cleanup-orphan-blobs.ts --grace-hours=48 --apply
 *   npx tsx prisma/scripts/cleanup-orphan-blobs.ts --pass=b --apply # store-led only
 */

import { config as loadEnv } from "dotenv";
import { list, del } from "@vercel/blob";
import { PrismaClient } from "@prisma/client";

// .env.local holds BLOB_READ_WRITE_TOKEN; .env holds DATABASE_URL. dotenv does
// not override already-set keys, so loading .env.local first preserves the
// Next.js precedence (.env.local wins) — though here the two files don't
// overlap on any key we use.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const prisma = new PrismaClient();

// ─── args ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const ALLOW_EMPTY_DB = argv.includes("--allow-empty-db");
const FORCE = argv.includes("--force");
const graceArg = argv.find((a) => a.startsWith("--grace-hours="));
const GRACE_HOURS = graceArg ? Number(graceArg.split("=")[1]) : 24;
const passArg = argv.find((a) => a.startsWith("--pass="));
const PASS = passArg ? passArg.split("=")[1].toLowerCase() : "ab"; // a | b | ab

if (!Number.isFinite(GRACE_HOURS) || GRACE_HOURS < 0) {
  throw new Error(`--grace-hours must be a non-negative number`);
}

const GRACE_MS = GRACE_HOURS * 60 * 60 * 1000;
const DELETE_BATCH = 100;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function maskDbHost(url: string | undefined): string {
  if (!url) return "(unset)";
  const m = url.match(/@([^/:?]+)/);
  return m ? m[1] : "(unparseable)";
}

interface ListedBlob {
  pathname: string;
  url: string;
  size: number;
  uploadedAt: Date;
}

async function listAllBlobs(token: string): Promise<ListedBlob[]> {
  const blobs: ListedBlob[] = [];
  let cursor: string | undefined;
  do {
    const res = await list({ token, cursor, limit: 1000 });
    for (const b of res.blobs) {
      blobs.push({
        pathname: b.pathname,
        url: b.url,
        size: b.size,
        uploadedAt: new Date(b.uploadedAt),
      });
    }
    cursor = res.cursor;
    process.stdout.write(`\r  …listed ${blobs.length} blobs`);
  } while (cursor);
  process.stdout.write("\n");
  return blobs;
}

async function delInBatches(urls: string[], token: string): Promise<number> {
  let done = 0;
  for (let i = 0; i < urls.length; i += DELETE_BATCH) {
    const chunk = urls.slice(i, i + DELETE_BATCH);
    await del(chunk, { token });
    done += chunk.length;
    process.stdout.write(`\r  …deleted ${done}/${urls.length}`);
  }
  if (urls.length) process.stdout.write("\n");
  return done;
}

// ─── Pass A: DB-led (the cron's logic, on demand) ────────────────────
async function passA(token: string): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - GRACE_MS);
  console.log(
    `\n=== Pass A — DB orphan rows (unlinked, older than ${GRACE_HOURS}h) ===`
  );

  const [regOrphans, receiptOrphans] = await Promise.all([
    prisma.registrationFile.findMany({
      where: { registrationId: null, uploadedAt: { lt: cutoff } },
      select: { id: true, blobPath: true, sizeBytes: true },
    }),
    prisma.phaseReceipt.findMany({
      where: { selection: null, uploadedAt: { lt: cutoff } },
      select: { id: true, blobPath: true },
    }),
  ]);

  const regBytes = regOrphans.reduce((s, r) => s + (r.sizeBytes ?? 0), 0);
  console.log(
    `  RegistrationFile orphans: ${regOrphans.length} (${fmtBytes(regBytes)})`
  );
  console.log(`  PhaseReceipt orphans    : ${receiptOrphans.length}`);

  // Blob paths we are about to remove via Pass A — exclude them from Pass B's
  // "referenced" set so Pass B doesn't re-list them as kept.
  const removedPaths = new Set<string>();

  if (!APPLY) {
    console.log("  (dry run — not deleting)");
    return removedPaths;
  }

  const allBlobUrls = [
    ...regOrphans.map((r) => r.blobPath),
    ...receiptOrphans.map((r) => r.blobPath),
  ];
  await delInBatches(allBlobUrls, token);

  // Delete the rows after their blobs (best-effort blob delete already done).
  for (const r of regOrphans) {
    await prisma.registrationFile.delete({ where: { id: r.id } }).catch(() => {});
    removedPaths.add(r.blobPath);
  }
  for (const r of receiptOrphans) {
    await prisma.phaseReceipt.delete({ where: { id: r.id } }).catch(() => {});
    removedPaths.add(r.blobPath);
  }
  console.log(
    `  ✓ removed ${regOrphans.length} reg-file + ${receiptOrphans.length} receipt rows`
  );
  return removedPaths;
}

// ─── Pass B: store-led (cascade-orphan blind spot) ───────────────────
async function passB(token: string, alreadyRemoved: Set<string>) {
  console.log(
    `\n=== Pass B — store blobs with NO DB row (older than ${GRACE_HOURS}h) ===`
  );

  // Referenced = every blobPath any surviving DB row points at.
  const [regFiles, receipts] = await Promise.all([
    prisma.registrationFile.findMany({ select: { blobPath: true } }),
    prisma.phaseReceipt.findMany({ select: { blobPath: true } }),
  ]);
  const referenced = new Set<string>();
  for (const r of regFiles) referenced.add(r.blobPath);
  for (const r of receipts) referenced.add(r.blobPath);
  console.log(
    `  DB references ${referenced.size} blob(s) ` +
      `(${regFiles.length} reg-file + ${receipts.length} receipt rows)`
  );

  console.log("  Listing the store…");
  const blobs = await listAllBlobs(token);
  const totalBytes = blobs.reduce((s, b) => s + b.size, 0);
  console.log(
    `  Store holds ${blobs.length} blob(s), ${fmtBytes(totalBytes)} total`
  );

  // WRONG-DB / EMPTY-DB GUARD. If the DB says nothing is referenced but the
  // store is full, we are almost certainly pointed at the wrong (or empty)
  // database — deleting here would nuke real files. Refuse unless forced.
  if (referenced.size === 0 && blobs.length > 0 && !ALLOW_EMPTY_DB) {
    console.error(
      "\n  ✋ ABORT: the database reports 0 referenced blobs but the store is " +
        "non-empty.\n     This usually means DATABASE_URL points at the wrong " +
        "or an empty DB.\n     Refusing to delete. If you are CERTAIN this DB " +
        "is correct and the\n     store genuinely has no live files, re-run " +
        "with --allow-empty-db."
    );
    process.exitCode = 2;
    return;
  }

  // Stronger wrong-DB guard. If the DB references only a small fraction
  // of the store, we are very likely pointed at a dev/staging DB while
  // the Blob token points at the PRODUCTION store — the exact footgun
  // that would mass-delete real attendee files. (This is precisely what
  // happened during development: a 24-registration dev DB vs a store
  // holding ~1500 live CVs/IDs.) Require an explicit --force, which
  // makes the operator re-confirm the db host printed above is correct.
  const refRatio = blobs.length ? referenced.size / blobs.length : 1;
  if (refRatio < 0.5 && blobs.length > 50 && !FORCE) {
    console.error(
      `\n  ✋ ABORT: the DB references only ${referenced.size} of ${blobs.length} ` +
        `blobs (${(refRatio * 100).toFixed(1)}%).\n     This strongly suggests ` +
        `DATABASE_URL is NOT the database the production store belongs to.\n` +
        `     Deleting now could destroy real attendee files. Verify the db ` +
        `host printed\n     above is PRODUCTION. If it genuinely is, re-run ` +
        `with --force.`
    );
    process.exitCode = 2;
    return;
  }

  const cutoff = Date.now() - GRACE_MS;
  const orphans: ListedBlob[] = [];
  let recentSkipped = 0;
  for (const b of blobs) {
    if (referenced.has(b.pathname)) continue; // live file — keep
    if (alreadyRemoved.has(b.pathname)) continue; // handled in Pass A
    if (b.uploadedAt.getTime() > cutoff) {
      recentSkipped += 1; // too new — a webhook may still be writing its row
      continue;
    }
    orphans.push(b);
  }

  const orphanBytes = orphans.reduce((s, b) => s + b.size, 0);
  console.log(
    `\n  Orphan blobs (no DB row, > ${GRACE_HOURS}h old): ${orphans.length} ` +
      `(${fmtBytes(orphanBytes)})`
  );
  if (recentSkipped) {
    console.log(
      `  Skipped ${recentSkipped} unreferenced blob(s) newer than the grace ` +
        `window (could be mid-upload)`
    );
  }

  // Show a sample so the operator can eyeball before --apply.
  const sample = orphans.slice(0, 12);
  if (sample.length) {
    console.log("\n  Sample of orphans that would be deleted:");
    for (const b of sample) {
      console.log(
        `    - ${b.pathname}  (${fmtBytes(b.size)}, ${b.uploadedAt
          .toISOString()
          .slice(0, 10)})`
      );
    }
    if (orphans.length > sample.length) {
      console.log(`    …and ${orphans.length - sample.length} more`);
    }
  }

  if (!APPLY) {
    console.log("\n  (dry run — not deleting)");
    return;
  }
  if (!orphans.length) return;

  console.log("\n  Deleting orphan blobs…");
  await delInBatches(
    orphans.map((b) => b.url),
    token
  );
  console.log(`  ✓ reclaimed ${fmtBytes(orphanBytes)}`);
}

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set. Put the PRIVATE store token in " +
        ".env.local (blob_rw_… for registration-receiptsregistratio)."
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (expected in .env).");
  }

  console.log("Orphan-blob reconciliation");
  console.log("──────────────────────────");
  console.log(`  mode       : ${APPLY ? "APPLY (will delete)" : "DRY RUN"}`);
  console.log(`  passes     : ${PASS.toUpperCase()}`);
  console.log(`  grace      : ${GRACE_HOURS}h`);
  console.log(`  blob token : ${token.slice(0, 14)}…`);
  console.log(`  db host    : ${maskDbHost(process.env.DATABASE_URL)}`);
  console.log(
    "  ⚠ token and DB must both be PRODUCTION, or Pass B will mis-classify " +
      "live files."
  );

  let removed = new Set<string>();
  if (PASS.includes("a")) removed = await passA(token);
  if (PASS.includes("b")) await passB(token, removed);

  console.log(
    `\nDone.${APPLY ? "" : " (nothing was deleted — re-run with --apply)"}`
  );
}

main()
  .catch((err) => {
    console.error("\n❌ cleanup failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
