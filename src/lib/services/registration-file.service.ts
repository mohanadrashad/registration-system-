/**
 * RegistrationFile service — FILE field uploads on the public
 * registration flow.
 *
 * Parallel to receipt.service.ts (which handles PhaseReceipt for the
 * portal/phase-selections feature). Same architecture, same blob.ts
 * primitives, separate table and separate code paths so changes to
 * either don't risk the other.
 *
 * Stage 1 surface:
 *   - writeRegistrationFileIdempotent: called from the upload-completed
 *     webhook to insert the row race-safely. Mirrors writeReceiptIdempotent's
 *     P2002-catch pattern (see comment in that file).
 *   - deleteRegistrationFileForSession: visitor-initiated pre-submission
 *     replace/remove. Gated on session-cookie ownership.
 *   - cleanupOrphanRegistrationFiles: nightly cron pass. Same defensive
 *     blob-delete-best-effort + log + still-delete-row pattern as
 *     cleanupOrphanReceipts.
 *
 * Stream-through read helpers will be added in Stage 3; the spec
 * amendment in PR #14 locked stream-through as the read path, so no
 * signed-URL helper appears here.
 */

import { Prisma } from "@prisma/client";
import type { RegistrationFile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteBlob } from "@/lib/blob";

// ─── Server-controlled pathname builder ──────────────────────────────
//
// Pathname scheme is server-controlled; the client never picks where
// its file lands. Mirrors receipt.service.ts's buildReceiptPathname.
//
//   events/<eventId>/registration-files/<sessionId>/<formFieldId>-<ts><ext>
//
// addRandomSuffix is applied by the SDK at the put-token-mint side, so
// concurrent uploads from the same session/field don't collide at the
// blob layer even before this server function runs.

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "application/pdf": ".pdf",
};

export function buildRegistrationFilePathname(args: {
  eventId: string;
  formFieldId: string;
  uploadSessionId: string;
  contentType: string;
}): string {
  const ext = CONTENT_TYPE_EXT[args.contentType] ?? "";
  const ts = Date.now();
  return `events/${args.eventId}/registration-files/${args.uploadSessionId}/${args.formFieldId}-${ts}${ext}`;
}

// ─── Idempotent write (called from onUploadCompleted) ────────────────

export interface WriteRegistrationFileInput {
  /** Blob pathname as returned by Vercel — the dedup key. */
  blobPath: string;
  /** Internal blob URL (never exposed to clients). */
  blobUrl: string;
  mimeType: string;
  sizeBytes: number;
  /** Display name shown to admins / attendees. */
  originalName: string;
  /** FormField this upload answers; cascade-deletes with the field. */
  formFieldId: string;
  /** Visitor's reg_upload_session cookie ID. */
  uploadSessionId: string;
}

export interface WriteRegistrationFileResult {
  fileId: string;
  /** True when this call inserted the row. False on idempotent re-write. */
  created: boolean;
}

/**
 * Vercel retries the onUploadCompleted webhook up to 5 times waiting
 * for a 200. This function must be safe to call N times for the same
 * blob pathname and produce the same end state. The @unique constraint
 * on RegistrationFile.blobPath makes the dedup race-safe at the DB
 * level: a retry hits the P2002 unique violation, we read the row
 * back, and return its existing ID with created=false.
 *
 * Pattern is a structural copy of writeReceiptIdempotent in
 * receipt.service.ts — same P2002 catch, same read-back-on-duplicate.
 * Differences from that function:
 *   - No "selection link" logic (FILE files don't have an
 *     AttendeeSelection back-ref).
 *   - registrationId is null at this stage; Stage 2 wires it on form
 *     submit.
 *   - uploadedBy follows the spec: "session:<id>" pre-submission.
 */
export async function writeRegistrationFileIdempotent(
  input: WriteRegistrationFileInput
): Promise<WriteRegistrationFileResult> {
  try {
    const created = await prisma.registrationFile.create({
      data: {
        registrationId: null,
        formFieldId: input.formFieldId,
        uploadSessionId: input.uploadSessionId,
        blobPath: input.blobPath,
        blobUrl: input.blobUrl,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        originalName: input.originalName,
        uploadedBy: `session:${input.uploadSessionId}`,
      },
      select: { id: true },
    });
    return { fileId: created.id, created: true };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      // Duplicate blobPath — a previous webhook attempt for this same
      // blob already succeeded. Re-read and return the existing ID.
      const existing = await prisma.registrationFile.findUnique({
        where: { blobPath: input.blobPath },
        select: { id: true },
      });
      if (!existing) throw e; // shouldn't happen but be defensive
      return { fileId: existing.id, created: false };
    }
    throw e;
  }
}

// ─── Pre-submission delete (visitor-initiated replace/remove) ────────

export class RegistrationFileNotFoundError extends Error {
  readonly code = "REGISTRATION_FILE_NOT_FOUND";
  constructor() {
    super("File not found.");
  }
}

/**
 * Delete a not-yet-submitted file when the visitor clicks Replace /
 * Remove. The provided sessionId must match the file's
 * uploadSessionId — otherwise we treat it as not-found to avoid
 * leaking existence to a different visitor.
 *
 * Refuses to delete a file that has already been linked to a
 * Registration (registrationId IS NOT NULL). Once the form is
 * submitted, FILE deletion goes through admin-side flows (out of
 * scope for v1).
 *
 * Blob delete is best-effort — failures are logged and don't block
 * the row delete. The nightly cleanup re-attempts the blob if the
 * row gets gone but the blob remains.
 */
export async function deleteRegistrationFileForSession(
  fileId: string,
  uploadSessionId: string
): Promise<void> {
  const file = await prisma.registrationFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      blobPath: true,
      uploadSessionId: true,
      registrationId: true,
    },
  });
  if (!file) throw new RegistrationFileNotFoundError();
  // Session mismatch OR already-submitted file → 404-equivalent so we
  // don't leak existence to a different visitor or to a probe trying
  // to find a stranger's fileId.
  if (file.uploadSessionId !== uploadSessionId || file.registrationId !== null) {
    throw new RegistrationFileNotFoundError();
  }

  try {
    await deleteBlob(file.blobPath);
  } catch (err) {
    console.warn(
      "[registration-file] blob delete failed on pre-submission delete:",
      file.blobPath,
      err
    );
  }

  try {
    await prisma.registrationFile.delete({ where: { id: file.id } });
  } catch (err) {
    // If the row delete fails, the orphan cleanup catches it tomorrow
    // (blob gone, registrationId still null) — but log so we notice if
    // this happens systematically.
    console.warn(
      "[registration-file] row delete failed on pre-submission delete:",
      file.id,
      err
    );
    throw err;
  }
}

// ─── Nightly orphan cleanup (cron) ───────────────────────────────────

export interface RegistrationFileOrphanCleanupResult {
  scanned: number;
  deletedRows: number;
  deletedBlobs: number;
  blobErrors: number;
}

/**
 * Nightly cleanup: removes RegistrationFile rows older than `graceMs`
 * (default 24h) whose registrationId is still null — i.e. the visitor
 * uploaded a file but abandoned the registration before submitting.
 *
 * Defensive pattern mirrors cleanupOrphanReceipts:
 *   - find candidates ordered by id (deterministic),
 *   - attempt the blob delete (best-effort, errors counted but don't
 *     block the row delete),
 *   - delete the row. If the row delete fails, we re-scan tomorrow.
 *
 * The grace window protects a freshly-uploaded file from being deleted
 * mid-write: between the blob landing on Vercel and the
 * onUploadCompleted webhook racing through this function, the row
 * exists with a recent uploadedAt and won't satisfy the cutoff.
 */
export async function cleanupOrphanRegistrationFiles(
  graceMs: number = 24 * 60 * 60 * 1000
): Promise<RegistrationFileOrphanCleanupResult> {
  const cutoff = new Date(Date.now() - graceMs);

  const orphans = await prisma.registrationFile.findMany({
    where: {
      registrationId: null,
      uploadedAt: { lt: cutoff },
    },
    select: { id: true, blobPath: true },
  });

  let deletedBlobs = 0;
  let blobErrors = 0;
  let deletedRows = 0;

  for (const orphan of orphans) {
    try {
      await deleteBlob(orphan.blobPath);
      deletedBlobs += 1;
    } catch (err) {
      blobErrors += 1;
      console.warn(
        "[cleanupOrphanRegistrationFiles] blob delete failed:",
        orphan.blobPath,
        err
      );
      // Keep going — still try the row delete so we don't re-scan
      // this orphan endlessly. If the row delete also fails, we re-
      // attempt the blob tomorrow.
    }
    try {
      await prisma.registrationFile.delete({ where: { id: orphan.id } });
      deletedRows += 1;
    } catch (err) {
      console.warn(
        "[cleanupOrphanRegistrationFiles] row delete failed:",
        orphan.id,
        err
      );
    }
  }

  return {
    scanned: orphans.length,
    deletedRows,
    deletedBlobs,
    blobErrors,
  };
}

// ─── Read helpers (used by Stage 1 routes; expand in Stages 2/3) ─────

export type RegistrationFileForSession = Pick<
  RegistrationFile,
  | "id"
  | "formFieldId"
  | "uploadSessionId"
  | "registrationId"
  | "mimeType"
  | "sizeBytes"
  | "originalName"
>;

/**
 * Look up a file by ID and return only enough metadata to make session-
 * ownership decisions. Returns null if the file doesn't exist; the
 * caller is responsible for the ownership check and for treating a
 * mismatch as 404.
 */
export async function getRegistrationFileById(
  fileId: string
): Promise<RegistrationFileForSession | null> {
  return prisma.registrationFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      formFieldId: true,
      uploadSessionId: true,
      registrationId: true,
      mimeType: true,
      sizeBytes: true,
      originalName: true,
    },
  });
}
