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

import { Prisma, FieldType } from "@prisma/client";
import type { RegistrationFile } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteBlob, streamPrivateBlob } from "@/lib/blob";

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

export interface RegistrationFileForAdminStreaming {
  id: string;
  blobPath: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
}

/**
 * Admin-side lookup for the stream-through read route. Returns the
 * minimal row data needed to pipe the blob bytes back, only if the
 * file's FormField belongs to the supplied event (cross-event guard).
 * Returns null on missing-or-cross-event so the route caller can map
 * either to a 404 without leaking existence.
 *
 * Mirrors the PhaseReceipt admin pattern at
 * src/lib/services/receipt.service.ts:getReceiptForAdmin — same shape,
 * same null-on-mismatch behavior, just different cascade chain
 * (RegistrationFile → FormField → Event rather than
 * PhaseReceipt → AttendeeSelection → Phase → Event).
 *
 * The caller is responsible for invoking authorizeEvent() before
 * calling this; the service does not re-validate the admin session.
 */
export async function getRegistrationFileForAdmin(
  fileId: string,
  eventId: string
): Promise<RegistrationFileForAdminStreaming | null> {
  const row = await prisma.registrationFile.findUnique({
    where: { id: fileId },
    include: {
      formField: { select: { eventId: true } },
    },
  });
  if (!row) return null;
  if (row.formField.eventId !== eventId) return null;
  return {
    id: row.id,
    blobPath: row.blobPath,
    mimeType: row.mimeType,
    originalName: row.originalName,
    sizeBytes: row.sizeBytes,
  };
}

/**
 * Convenience for the stream route — fetches the SDK stream object for
 * a private blob. Throws if the blob is missing (orphan-cleanup window
 * or manual delete); the route handler maps that to 410 Gone.
 *
 * Same convenience wrapper as openReceiptStream in receipt.service.ts.
 */
export async function openRegistrationFileStream(
  file: RegistrationFileForAdminStreaming
) {
  return streamPrivateBlob(file.blobPath);
}

export interface PreSubmissionFile {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
}

/**
 * Visitor-facing lookup: returns the most-recent not-yet-submitted file
 * for a given (uploadSessionId, formFieldId) pair, or null when none
 * exists. Used by the public upload control to poll after a Vercel Blob
 * upload finishes so it can read back the fileId the onUploadCompleted
 * webhook just minted.
 *
 * The DELETE-then-upload replace flow guarantees at most one matching
 * row at any time, but we still order DESC + take(1) to be defensive
 * against a stale row that hasn't been swept yet.
 */
export async function getCurrentPreSubmissionFile(args: {
  uploadSessionId: string;
  formFieldId: string;
}): Promise<PreSubmissionFile | null> {
  const row = await prisma.registrationFile.findFirst({
    where: {
      uploadSessionId: args.uploadSessionId,
      formFieldId: args.formFieldId,
      registrationId: null,
    },
    orderBy: { uploadedAt: "desc" },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true,
    },
  });
  return row;
}

// ─── Admin replace + remove (Stage 3 of ADMIN_EDIT_FIX_SPEC) ─────────
//
// The admin-side counterpart to the visitor's pre-submission replace.
// Two key differences from visitor flow:
//   - Auth is admin NextAuth session, not the reg_upload_session cookie
//     — caller authorizes with authorizeEvent before invoking these.
//   - Files are post-submission (registrationId already set), so the
//     orphan-cleanup cron (which gates on registrationId IS NULL) won't
//     sweep them; we rely on the transactional swap + best-effort blob
//     delete to keep storage tidy.
//
// Both helpers stamp:
//   - RegistrationFile.uploadedBy = "admin:<actorId>" on the new row.
//   - Registration.formData[fieldName]                — new ref or null.
//   - Contact.metadata[fieldName]                     — same; Stage 1's
//     dual-store invariant. View paths read from Contact.metadata,
//     CSV/badge/email read from Registration.formData.
//   - Registration.updater + Contact.updater          — Stage 1 audit.
//
// The orchestration is intentionally NOT here for replace — that flow
// is two-phase (token mint + onUploadCompleted webhook), and the
// service exposes the two phases separately. Remove is single-phase
// so it lives in one function.

export class AdminFileNotReplaceableError extends Error {
  readonly code = "ADMIN_FILE_NOT_REPLACEABLE";
  constructor(reason: string) {
    super(reason);
  }
}

export interface ValidatedAdminReplaceTarget {
  registrationId: string;
  formField: {
    id: string;
    name: string;
    type: FieldType;
    metadata: unknown;
  };
  existingFile: {
    id: string;
    blobPath: string;
  };
}

/**
 * Used in the admin-replace endpoint's `onBeforeGenerateToken`. The
 * URL identifies the operation by the existing fileId — the file must:
 *   - exist,
 *   - belong to a registration on the URL's event AND contact,
 *   - link to a FormField that is a FILE type on the URL's event.
 *
 * formFieldId is derived from the existing file rather than taken from
 * the URL because the URL slug `[fileId]` is shared with the remove
 * endpoint (Next.js requires the same slug name at the same path
 * position across sibling routes). This is the v1 deviation from the
 * spec's "[formFieldId] in URL" wording; mockup #2b confirms admin
 * UI only ever invokes Replace when a file exists, so the fileId is
 * always known client-side.
 *
 * Throws AdminFileNotReplaceableError on any mismatch so the route can
 * 404 uniformly without leaking which check failed.
 */
export async function validateAdminReplaceTarget(input: {
  eventId: string;
  contactId: string;
  fileId: string;
}): Promise<ValidatedAdminReplaceTarget> {
  const file = await prisma.registrationFile.findUnique({
    where: { id: input.fileId },
    select: {
      id: true,
      blobPath: true,
      registrationId: true,
      registration: {
        select: { id: true, contactId: true, eventId: true },
      },
      formField: {
        select: {
          id: true,
          name: true,
          type: true,
          eventId: true,
          metadata: true,
        },
      },
    },
  });
  if (!file) {
    throw new AdminFileNotReplaceableError("File not found");
  }
  // Cross-event + cross-contact guard. The file's formField AND
  // registration must both belong to the URL's event, and the
  // registration's contact must match the URL's contact.
  if (file.formField.eventId !== input.eventId) {
    throw new AdminFileNotReplaceableError("File not found");
  }
  if (
    !file.registration ||
    file.registration.eventId !== input.eventId ||
    file.registration.contactId !== input.contactId
  ) {
    throw new AdminFileNotReplaceableError("File not found");
  }
  if (file.formField.type !== FieldType.FILE) {
    // Shouldn't happen if the row was minted via the FILE flow, but
    // guard in case the FormField type changed after upload.
    throw new AdminFileNotReplaceableError("Form field is not a FILE field");
  }
  if (!file.registrationId) {
    // Pre-submission file — admin shouldn't touch via the admin route.
    // The visitor's own DELETE handles those.
    throw new AdminFileNotReplaceableError(
      "File is not yet linked to a registration"
    );
  }

  return {
    registrationId: file.registrationId,
    formField: {
      id: file.formField.id,
      name: file.formField.name,
      type: file.formField.type,
      metadata: file.formField.metadata,
    },
    existingFile: {
      id: file.id,
      blobPath: file.blobPath,
    },
  };
}

/**
 * The denormalized FILE ref written into both stores, or null to clear
 * the field (admin Remove). Shape matches what the public registration
 * POST writes and what isFileRef() on the client expects.
 */
type DualStoreFileRef =
  | { fileId: string; filename: string; mimeType: string; sizeBytes: number }
  | null;

/**
 * Shared dual-store write used by every admin FILE mutation (replace,
 * create-into-empty, remove). Stage 1's invariant: the FILE ref lives in
 * BOTH `Registration.formData[fieldName]` (canonical for CSV/badge/email)
 * AND `Contact.metadata[fieldName]` (what the view-mode dashboard reads),
 * and every admin write stamps `updater` on both rows (Stage 1 audit).
 *
 * Read-merge-write rather than a jsonb path update so we don't depend on
 * Postgres-specific jsonb_set semantics. Must run inside the caller's
 * transaction so the row insert/delete and these writes commit atomically.
 * Pass `ref: null` to clear the field (Remove).
 */
async function writeFileRefDualStore(
  tx: Prisma.TransactionClient,
  args: {
    registrationId: string;
    contactId: string;
    fieldName: string;
    ref: DualStoreFileRef;
    actorId: string;
  }
): Promise<void> {
  const registration = await tx.registration.findUnique({
    where: { id: args.registrationId },
    select: { formData: true },
  });
  const baseForm =
    (registration?.formData as Record<string, unknown> | null) ?? {};
  await tx.registration.update({
    where: { id: args.registrationId },
    data: {
      formData: {
        ...baseForm,
        [args.fieldName]: args.ref,
      } as Prisma.InputJsonValue,
      updater: { connect: { id: args.actorId } },
    },
  });

  const contact = await tx.contact.findUnique({
    where: { id: args.contactId },
    select: { metadata: true },
  });
  const baseMeta =
    (contact?.metadata as Record<string, unknown> | null) ?? {};
  await tx.contact.update({
    where: { id: args.contactId },
    data: {
      metadata: {
        ...baseMeta,
        [args.fieldName]: args.ref,
      } as Prisma.InputJsonValue,
      updater: { connect: { id: args.actorId } },
    },
  });
}

export interface CompleteAdminReplaceInput {
  registrationId: string;
  contactId: string;
  formField: { id: string; name: string };
  oldFileId: string;
  oldBlobPath: string;
  newBlob: {
    pathname: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    originalName: string;
  };
  actorId: string;
}

export interface CompleteAdminReplaceResult {
  newFileId: string;
}

/**
 * Used in the admin-replace endpoint's `onUploadCompleted`. Atomically:
 *   1. Deletes the old RegistrationFile row.
 *   2. Inserts a new RegistrationFile row with uploadedBy=
 *      "admin:<actorId>", registrationId already set, and
 *      uploadSessionId="admin:<actorId>" as a sentinel (the column is
 *      NOT NULL but is only ownership-checked when registrationId is
 *      null — see deleteRegistrationFileForSession).
 *   3. Updates Registration.formData[fieldName] to the new denormalized
 *      ref + stamps Registration.updater.
 *   4. Updates Contact.metadata[fieldName] to the same ref + stamps
 *      Contact.updater. Mirrors Stage 1's dual-store invariant: view
 *      paths read from Contact.metadata while CSV/badge/email read
 *      from Registration.formData.
 *
 * Blob delete is BEST-EFFORT and happens AFTER the transaction commits.
 * If the blob delete fails, the row swap still stands — the orphan
 * blob is a small storage leak but not a data integrity problem. The
 * caller's onUploadCompleted catch-block deletes the new blob if the
 * transaction itself rolls back (refinement #1 from the Chunk 1 spec).
 */
export async function completeAdminReplaceFile(
  input: CompleteAdminReplaceInput
): Promise<CompleteAdminReplaceResult> {
  const newFileRef = {
    fileId: "", // filled in after the create
    filename: input.newBlob.originalName,
    mimeType: input.newBlob.mimeType,
    sizeBytes: input.newBlob.sizeBytes,
  };
  const actorSentinel = `admin:${input.actorId}`;

  const { newFileId } = await prisma.$transaction(async (tx) => {
    // 1. Delete old row first so a unique-constraint race (admin retry)
    //    can't collide with the new insert. Both rows live under the
    //    same (registrationId, formFieldId); the schema doesn't unique-
    //    constrain that pair but we keep the lifecycle clean.
    await tx.registrationFile.delete({ where: { id: input.oldFileId } });

    // 2. Insert the new row. uploadedBy + uploadSessionId encode the
    //    actor so the row is self-describing without joining User.
    const created = await tx.registrationFile.create({
      data: {
        registrationId: input.registrationId,
        formFieldId: input.formField.id,
        uploadSessionId: actorSentinel,
        blobPath: input.newBlob.pathname,
        blobUrl: input.newBlob.url,
        mimeType: input.newBlob.mimeType,
        sizeBytes: input.newBlob.sizeBytes,
        originalName: input.newBlob.originalName,
        uploadedBy: actorSentinel,
      },
      select: { id: true },
    });
    newFileRef.fileId = created.id;

    // 3+4. Mirror the new ref into Registration.formData (canonical for
    //      CSV/badge/email) AND Contact.metadata (view-mode dashboard),
    //      stamping updater on both. Stage 1's dual-store invariant.
    await writeFileRefDualStore(tx, {
      registrationId: input.registrationId,
      contactId: input.contactId,
      fieldName: input.formField.name,
      ref: newFileRef,
      actorId: input.actorId,
    });

    return { newFileId: created.id };
  });

  // 5. Old blob delete — best-effort, post-commit. del() is idempotent
  //    so a missing blob is a no-op; failures just leak storage and
  //    are logged for visibility.
  try {
    await deleteBlob(input.oldBlobPath);
  } catch (err) {
    console.warn(
      "[admin replace] old blob delete failed (storage leak):",
      input.oldBlobPath,
      err
    );
  }

  return { newFileId };
}

// ─── Admin upload-into-empty (queue item #2) ─────────────────────────
//
// Lets an admin upload a NEW file into a FILE field that is currently
// empty (after a Remove, or a visitor who never uploaded). Distinct from
// replace because there is no existing fileId to key on — the URL keys
// on formFieldId, and validation walks contact → registration (1:1) +
// formField instead of fileId → row.
//
// The new row uses uploadedBy = "admin-new:<actorId>" (a distinct
// sentinel from replace's "admin:<actorId>") so getAdminFileProvenance
// can render "Uploaded by <admin>" WITHOUT the "(replaced visitor
// upload)" clause — there was no prior file to replace.

export interface ValidatedAdminUploadTarget {
  registrationId: string;
  formField: {
    id: string;
    name: string;
    type: FieldType;
    metadata: unknown;
  };
}

/**
 * Used in the admin-upload endpoint's `onBeforeGenerateToken`. The URL
 * identifies the operation by (contactId, formFieldId). The target must:
 *   - resolve to a contact on the URL's event,
 *   - whose contact HAS a registration (1:1) — v1 hides Upload for
 *     registration-less contacts, but we guard server-side too because
 *     formData lives on Registration,
 *   - link to a FormField that is a FILE type on the URL's event,
 *   - AND the field must be currently EMPTY (no RegistrationFile row for
 *     that registration+formField). A non-empty field rejects with a
 *     message steering the admin to Replace — keeps the two flows
 *     disjoint and prevents two concurrent uploads creating two rows.
 *
 * Throws AdminFileNotReplaceableError on any failure; the route surfaces
 * `.message` as the client toast. Cross-event mismatches use a uniform
 * "not found" so existence doesn't leak; the empty-field guard uses an
 * informative message by design (it's actionable, not a probe vector).
 */
export async function validateAdminUploadTarget(input: {
  eventId: string;
  contactId: string;
  formFieldId: string;
}): Promise<ValidatedAdminUploadTarget> {
  const contact = await prisma.contact.findUnique({
    where: { id: input.contactId },
    select: {
      id: true,
      eventId: true,
      registration: { select: { id: true } },
    },
  });
  if (!contact || contact.eventId !== input.eventId) {
    throw new AdminFileNotReplaceableError("Contact not found");
  }
  if (!contact.registration) {
    // No registration → nowhere to write formData. v1 non-goal.
    throw new AdminFileNotReplaceableError(
      "This contact has not registered yet, so a file can't be added."
    );
  }
  const registrationId = contact.registration.id;

  const formField = await prisma.formField.findUnique({
    where: { id: input.formFieldId },
    select: {
      id: true,
      name: true,
      type: true,
      eventId: true,
      metadata: true,
    },
  });
  if (!formField || formField.eventId !== input.eventId) {
    throw new AdminFileNotReplaceableError("Form field not found");
  }
  if (formField.type !== FieldType.FILE) {
    throw new AdminFileNotReplaceableError("Form field is not a FILE field");
  }

  // Empty-field guard. The RegistrationFile row is the source of truth
  // (a Remove deletes it); formData mirrors it. If a row exists the admin
  // must use Replace.
  const existing = await prisma.registrationFile.findFirst({
    where: { registrationId, formFieldId: formField.id },
    select: { id: true },
  });
  if (existing) {
    throw new AdminFileNotReplaceableError(
      "This field already has a file — use Replace instead."
    );
  }

  return {
    registrationId,
    formField: {
      id: formField.id,
      name: formField.name,
      type: formField.type,
      metadata: formField.metadata,
    },
  };
}

export interface CompleteAdminCreateInput {
  registrationId: string;
  contactId: string;
  formField: { id: string; name: string };
  newBlob: {
    pathname: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
    originalName: string;
  };
  actorId: string;
}

export interface CompleteAdminCreateResult {
  newFileId: string;
}

/**
 * Used in the admin-upload endpoint's `onUploadCompleted`. Insert-only
 * sibling of completeAdminReplaceFile — no old row to delete, no old blob
 * to clean up. Atomically:
 *   1. Inserts a new RegistrationFile row with uploadedBy=
 *      "admin-new:<actorId>" + registrationId set.
 *   2. Writes the denormalized ref into both stores + stamps updater
 *      (shared writeFileRefDualStore helper).
 *
 * NOT merged into completeAdminReplaceFile because the validate paths and
 * the delete-old semantics differ; the shared part is the dual-store
 * write, which both call.
 */
export async function completeAdminCreateFile(
  input: CompleteAdminCreateInput
): Promise<CompleteAdminCreateResult> {
  const newFileRef = {
    fileId: "", // filled in after the create
    filename: input.newBlob.originalName,
    mimeType: input.newBlob.mimeType,
    sizeBytes: input.newBlob.sizeBytes,
  };
  const actorSentinel = `admin-new:${input.actorId}`;

  const { newFileId } = await prisma.$transaction(async (tx) => {
    const created = await tx.registrationFile.create({
      data: {
        registrationId: input.registrationId,
        formFieldId: input.formField.id,
        uploadSessionId: actorSentinel,
        blobPath: input.newBlob.pathname,
        blobUrl: input.newBlob.url,
        mimeType: input.newBlob.mimeType,
        sizeBytes: input.newBlob.sizeBytes,
        originalName: input.newBlob.originalName,
        uploadedBy: actorSentinel,
      },
      select: { id: true },
    });
    newFileRef.fileId = created.id;

    await writeFileRefDualStore(tx, {
      registrationId: input.registrationId,
      contactId: input.contactId,
      fieldName: input.formField.name,
      ref: newFileRef,
      actorId: input.actorId,
    });

    return { newFileId: created.id };
  });

  return { newFileId };
}

export interface AdminRemoveFileInput {
  eventId: string;
  contactId: string;
  fileId: string;
  actorId: string;
}

export interface AdminRemoveFileResult {
  fieldName: string;
}

/**
 * Admin-initiated removal of an existing post-submission FILE answer.
 * Cross-event guarded via the same chain validateAdminReplaceTarget
 * uses. Returns the field name so the caller can echo it in the
 * response (UI uses it to refetch + render the empty state).
 *
 * Sets BOTH Registration.formData[fieldName] = null AND
 * Contact.metadata[fieldName] = null. The null (vs key-delete) is per
 * decision #4 from the Stage 3 audit — keeps the missing answer
 * debuggable in JSON dumps. The empty-check pattern used by the
 * required-field warning treats null and missing-key the same.
 *
 * Blob delete is best-effort, post-commit, same rationale as replace.
 */
export async function adminRemoveFile(
  input: AdminRemoveFileInput
): Promise<AdminRemoveFileResult> {
  const file = await prisma.registrationFile.findUnique({
    where: { id: input.fileId },
    select: {
      id: true,
      blobPath: true,
      registrationId: true,
      registration: {
        select: { contactId: true, eventId: true },
      },
      formField: {
        select: { id: true, name: true, eventId: true, type: true },
      },
    },
  });
  if (!file) {
    throw new AdminFileNotReplaceableError("File not found");
  }
  // Cross-event guard: file's formField AND registration must both
  // belong to the URL's event AND the URL's contact.
  if (
    file.formField.eventId !== input.eventId ||
    !file.registration ||
    file.registration.eventId !== input.eventId ||
    file.registration.contactId !== input.contactId
  ) {
    throw new AdminFileNotReplaceableError("File not found");
  }
  if (file.formField.type !== FieldType.FILE) {
    // Shouldn't happen if the file row was minted via the FILE flow,
    // but guard anyway in case the FormField type was changed after
    // upload (admin edit on the form-builder side).
    throw new AdminFileNotReplaceableError("File field type mismatch");
  }
  if (!file.registrationId) {
    // Pre-submission file — admin shouldn't be touching these via the
    // admin route. The visitor's own DELETE endpoint handles those.
    throw new AdminFileNotReplaceableError(
      "File is not yet linked to a registration"
    );
  }

  const fieldName = file.formField.name;
  const registrationId = file.registrationId;
  const contactId = input.contactId;

  await prisma.$transaction(async (tx) => {
    // 1. Delete the row.
    await tx.registrationFile.delete({ where: { id: file.id } });

    // 2+3. Null out the field in BOTH stores + stamp updater. Same
    //      dual-store invariant as replace/create; ref=null clears it.
    await writeFileRefDualStore(tx, {
      registrationId,
      contactId,
      fieldName,
      ref: null,
      actorId: input.actorId,
    });
  });

  // 4. Best-effort blob delete.
  try {
    await deleteBlob(file.blobPath);
  } catch (err) {
    console.warn(
      "[admin remove] blob delete failed (storage leak):",
      file.blobPath,
      err
    );
  }

  return { fieldName };
}

// ─── Admin provenance lookup (Chunk 4 meta endpoint backing) ─────────
//
// Resolves the uploadedBy string ("registration:<id>" | "admin:<userId>")
// into a UI-renderable shape: { uploadedBy: "visitor" | "admin",
// uploadedByName: string | null, uploadedAt, wasReplaced }.
//
// uploadedByName for admin uploads comes from the User table; null if
// the user was deleted (the SetNull semantic on the audit-trail FK
// means we can't always join, but uploadedBy still tells us it WAS an
// admin). The UI falls back to "a former admin" in that case.

export type AdminFileProvenanceKind = "visitor" | "admin";

export interface AdminFileProvenance {
  uploadedBy: AdminFileProvenanceKind;
  uploadedByName: string | null;
  uploadedAt: Date;
  wasReplaced: boolean;
}

/**
 * Reads the row + (optionally) the admin user name. Cross-event
 * guarded. Returns null on missing or cross-event so the route can
 * map to 404 without leaking existence.
 */
export async function getAdminFileProvenance(input: {
  fileId: string;
  eventId: string;
}): Promise<AdminFileProvenance | null> {
  const row = await prisma.registrationFile.findUnique({
    where: { id: input.fileId },
    select: {
      uploadedBy: true,
      uploadedAt: true,
      formField: { select: { eventId: true } },
    },
  });
  if (!row || row.formField.eventId !== input.eventId) {
    return null;
  }

  // Admin-created-into-empty ("admin-new:<id>") — NO prior file, so
  // wasReplaced is false and the UI omits the "(replaced visitor upload)"
  // clause. Checked BEFORE the "admin:" branch because "admin-new:" does
  // not start with "admin:" (the 6th char is "-", not ":"), but keeping
  // it first makes the two-sentinel intent explicit.
  if (row.uploadedBy.startsWith("admin-new:")) {
    const userId = row.uploadedBy.slice("admin-new:".length);
    const user = userId
      ? await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        })
      : null;
    return {
      uploadedBy: "admin",
      uploadedByName: user?.name ?? null,
      uploadedAt: row.uploadedAt,
      wasReplaced: false,
    };
  }

  // Admin-replaced ("admin:<id>") — there WAS a prior visitor file.
  if (row.uploadedBy.startsWith("admin:")) {
    const userId = row.uploadedBy.slice("admin:".length);
    const user = userId
      ? await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        })
      : null;
    return {
      uploadedBy: "admin",
      uploadedByName: user?.name ?? null,
      uploadedAt: row.uploadedAt,
      wasReplaced: true,
    };
  }

  // Anything that's NOT "admin..." we treat as visitor. Covers both
  // "registration:<id>" (post-submit claim) and "session:<id>" (pre-
  // submit — shouldn't appear on the attendee detail page in practice
  // but we render it the same way if it does).
  return {
    uploadedBy: "visitor",
    uploadedByName: null,
    uploadedAt: row.uploadedAt,
    wasReplaced: false,
  };
}

// ─── Admin file read-back (post-upload poll) ─────────────────────────
//
// Backs the cell's poll after an admin Upload/Replace. The @vercel/blob
// `upload()` resolves when bytes hit storage, BEFORE the onUploadCompleted
// webhook writes the RegistrationFile row + dual-store refs. A single
// immediate refetch therefore races the webhook (see the visitor-side
// waitForUploadedFile in file-upload-control.tsx). The cell polls this
// until the field reflects the new file, then settles.
//
// Returns the current denormalized ref for (contact's registration,
// formField), or null when no file is present yet — null is a NORMAL
// transient state during the webhook window, NOT an error, so callers
// keep polling rather than 404ing. Cross-event / cross-contact / non-FILE
// mismatches also return null (a probe can't distinguish "empty" from
// "not yours", so existence doesn't leak).

export interface AdminCurrentFile {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export async function getAdminCurrentFile(input: {
  eventId: string;
  contactId: string;
  formFieldId: string;
}): Promise<AdminCurrentFile | null> {
  const contact = await prisma.contact.findUnique({
    where: { id: input.contactId },
    select: { eventId: true, registration: { select: { id: true } } },
  });
  if (!contact || contact.eventId !== input.eventId || !contact.registration) {
    return null;
  }

  const formField = await prisma.formField.findUnique({
    where: { id: input.formFieldId },
    select: { eventId: true, type: true },
  });
  if (
    !formField ||
    formField.eventId !== input.eventId ||
    formField.type !== FieldType.FILE
  ) {
    return null;
  }

  // Defensive desc + first: post-submission there is exactly one row per
  // (registration, formField), but a Replace's old/new swap is atomic so
  // the poll only ever sees one committed row at a time.
  const row = await prisma.registrationFile.findFirst({
    where: {
      registrationId: contact.registration.id,
      formFieldId: input.formFieldId,
    },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
  });
  if (!row) return null;

  return {
    fileId: row.id,
    filename: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
  };
}
