/**
 * One-time gate for REGISTRATION_CUSTOMIZATION Stage 3 (Feature A4 — upload).
 *
 * The registration page is public, so an admin-uploaded logo must be served
 * publicly with no auth. Stage 0 chose option (a): write branding assets as
 * PUBLIC blobs (`put(path, data, { access: "public" })`) and store the
 * returned CDN URL. This script confirms that assumption holds against the
 * LIVE store/token before we build the upload route — the existing store runs
 * in "Private mode", so a public put is NOT guaranteed to be accepted.
 *
 * Run:
 *   npx tsx prisma/scripts/public-put-smoke-test.ts
 *
 * PASS → public put returns a URL that fetches 200 with the right content-type
 *        and bytes, with NO auth header → safe to build the upload.
 * FAIL → STOP; the public-store assumption is wrong, revisit Stage 0.
 */

import { config as loadEnv } from "dotenv";
import { put, del } from "@vercel/blob";

loadEnv({ path: ".env.local" });

// 1×1 transparent PNG — a real image so we can assert the content-type
// round-trips, not just text.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG_BYTES = Buffer.from(PNG_BASE64, "base64");
const TEST_PATH = `smoke-tests/public-put-${Date.now()}.png`;

async function main() {
  // Public branding assets live in a SEPARATE public store, so we must pass
  // that store's token explicitly — the default token targets the private store.
  const token = process.env.BLOB_PUBLIC_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "BLOB_PUBLIC_READ_WRITE_TOKEN is not set. Add the public store's read-write token to .env.local."
    );
  }

  console.log("[1/3] put() — uploading PUBLIC blob…");
  const uploaded = await put(TEST_PATH, PNG_BYTES, {
    access: "public",
    contentType: "image/png",
    addRandomSuffix: true,
    token,
  });
  console.log("       url        :", uploaded.url);
  console.log("       pathname   :", uploaded.pathname);
  console.log("       result keys:", Object.keys(uploaded).join(", "));

  console.log(
    "\n[2/3] fetch(url) with NO auth header — must be directly public…"
  );
  const res = await fetch(uploaded.url); // deliberately no Authorization header
  const contentType = res.headers.get("content-type") ?? "(none)";
  const body = Buffer.from(await res.arrayBuffer());
  console.log("       status      :", res.status);
  console.log("       content-type:", contentType);
  console.log(
    `       bytes        : ${body.length} (expected ${PNG_BYTES.length})`
  );

  const ok =
    res.status === 200 &&
    contentType.startsWith("image/png") &&
    body.length === PNG_BYTES.length;

  console.log("\n[3/3] del() — cleanup…");
  await del(uploaded.url, { token }).catch((e) =>
    console.warn("       cleanup del() failed (non-fatal):", (e as Error).message)
  );

  if (ok) {
    console.log(
      "\n✅ PASS — public put returns a directly-fetchable URL (200, image/png, bytes match)."
    );
    console.log("   Stage 3 upload can be built on `put({ access: 'public' })`.");
  } else {
    console.log(
      "\n❌ FAIL — public URL was not directly fetchable as expected. STOP and revisit Stage 0."
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n❌ Smoke test errored:", err);
  process.exit(1);
});
