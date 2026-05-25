/**
 * Receipt storage for Stage 4 of Phase Selections.
 *
 * Hosts the idempotent write helper used by the Vercel Blob
 * `onUploadCompleted` webhook (which retries up to 5 times waiting for
 * a 200), plus the auth-gated read and delete helpers used by the
 * stream-through endpoints. Per the user's instruction we don't use
 * signed URLs — the @vercel/blob v2.x SDK has no `getSignedReadUrl()`
 * helper, so reads pipe bytes through our auth-gated endpoint instead.
 *
 * Pathname scheme is server-controlled (never trust the client):
 *   events/<eventId>/receipts/<registrationId>/<selectionId>-<timestamp><ext>
 * with `addRandomSuffix: true` appending entropy at the SDK level.
 */

import { Prisma } from "@prisma/client";
import type { PhaseReceipt, AttendeeSelection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteBlob, streamPrivateBlob } from "@/lib/blob";

// ─── File constraints ────────────────────────────────────────────────

export const RECEIPT_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

export const RECEIPT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── Idempotent write (called from onUploadCompleted) ────────────────

export interface WriteReceiptInput {
  /** Blob pathname as returned by Vercel — the dedup key. */
  blobPath: string;
  /** Internal blob URL (never exposed to clients). */
  blobUrl: string;
  mimeType: string;
  sizeBytes: number;
  /** Display name to show to admins / attendees. */
  originalName: string;
  /** Who uploaded — "registration:<id>" or "admin:<userId>" per spec. */
  uploadedBy: string;
  /** Target option's ID; the selection is found-or-created on this. */
  optionId: string;
  /** Target phase + registration — the (phase, reg, option) triple is the AttendeeSelection's unique key. */
  phaseId: string;
  registrationId: string;
  /**
   * If the client is replacing an existing receipt, this is the
   * receipt ID being replaced. The handler verifies the selection's
   * current receiptFileId still matches before deleting the old blob.
   * `null` for first-time uploads.
   */
  replacePreviousReceiptId: string | null;
}

export interface WriteReceiptResult {
  receiptId: string;
  /** True when this call inserted the row. False on idempotent re-receipt. */
  created: boolean;
  /** True when the selection now points at this receipt. False when an out-of-order retry or race left it unlinked (orphan; Stage 5 cleanup catches). */
  linked: boolean;
}

/**
 * Vercel retries the `onUploadCompleted` webhook up to 5 times waiting
 * for a 200. This function must be safe to call N times for the same
 * blob pathname and produce the same end state. The unique constraint
 * on PhaseReceipt.blobPath makes the dedup race-safe at the DB level.
 */
export async function writeReceiptIdempotent(
  input: WriteReceiptInput
): Promise<WriteReceiptResult> {
  return prisma.$transaction(async (tx) => {
    // ── Step 1: insert PhaseReceipt. Race-safe via @unique on blobPath.
    // If a retry of the same webhook arrives, the unique violation
    // tells us the row already exists; we read it back and short-
    // circuit. This is the idempotency guarantee.
    let receipt: PhaseReceipt;
    try {
      receipt = await tx.phaseReceipt.create({
        data: {
          blobPath: input.blobPath,
          blobUrl: input.blobUrl,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          originalName: input.originalName,
          uploadedBy: input.uploadedBy,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        // Duplicate blobPath — a previous webhook attempt for this same
        // blob already succeeded. Re-read and return its state. We
        // check the linked-selection back-ref because the original
        // attempt may have linked it (case B/A) or orphaned it (C);
        // we want to report the same outcome on the retry.
        const existing = await tx.phaseReceipt.findUnique({
          where: { blobPath: input.blobPath },
        });
        if (!existing) throw e; // shouldn't happen, but be defensive
        const linkedSelection = await tx.attendeeSelection.findFirst({
          where: { receiptFileId: existing.id },
          select: { id: true },
        });
        return {
          receiptId: existing.id,
          created: false,
          linked: linkedSelection !== null,
        };
      }
      throw e;
    }

    // ── Step 2: find-or-create the AttendeeSelection. ATTENDEE_PICKS
    // and MIXED both rely on a pre-existing selection from the user's
    // Submit click. EXTERNAL_BOOKING creates the selection here for
    // the first time. The upsert covers both uniformly.
    const selection = await tx.attendeeSelection.upsert({
      where: {
        phaseId_registrationId_optionId: {
          phaseId: input.phaseId,
          registrationId: input.registrationId,
          optionId: input.optionId,
        },
      },
      update: {}, // no-op if exists — we mutate receiptFileId below if appropriate
      create: {
        phaseId: input.phaseId,
        registrationId: input.registrationId,
        optionId: input.optionId,
        source: "ATTENDEE_PICKED",
      },
    });

    // ── Step 3: decide whether to link the new receipt to the
    // selection. Three cases:
    //
    //   (A) Replacement intent (client passed replacePreviousReceiptId)
    //       AND the selection still points at that previous receipt:
    //         → delete old blob (best-effort), delete old row, link
    //         new one. The user's intent at upload-token-request time
    //         is honoured.
    //
    //   (B) No replacement intent, and the selection is currently
    //       unlinked (fresh upload, or the user previously deleted
    //       their receipt):
    //         → link.
    //
    //   (C) Anything else (selection already linked to a different
    //       receipt, or replacePreviousReceiptId doesn't match the
    //       current linked receipt anymore):
    //         → the new receipt is an orphan. Don't relink. Stage 5's
    //         nightly cleanup deletes orphans older than 24h.
    //
    // (C) covers both the out-of-order retry scenario (webhook for
    // upload X arrives after upload X' has already been linked) AND
    // multi-device races where another session linked a different
    // receipt between our token-request and our upload-complete.
    let linked = false;
    const currentlyLinkedId = selection.receiptFileId;

    if (
      input.replacePreviousReceiptId !== null &&
      currentlyLinkedId === input.replacePreviousReceiptId
    ) {
      // (A) Replacement.
      const oldReceipt = await tx.phaseReceipt.findUnique({
        where: { id: input.replacePreviousReceiptId },
      });
      if (oldReceipt) {
        // Best-effort blob delete. If this fails the orphan-cleanup
        // job catches it; we don't want to block the DB write.
        try {
          await deleteBlob(oldReceipt.blobPath);
        } catch (err) {
          console.warn(
            "[receipt] failed to delete old blob on replace:",
            oldReceipt.blobPath,
            err
          );
        }
        await tx.phaseReceipt.delete({
          where: { id: oldReceipt.id },
        });
      }
      await tx.attendeeSelection.update({
        where: { id: selection.id },
        data: { receiptFileId: receipt.id },
      });
      linked = true;
    } else if (currentlyLinkedId === null) {
      // (B) Fresh link.
      await tx.attendeeSelection.update({
        where: { id: selection.id },
        data: { receiptFileId: receipt.id },
      });
      linked = true;
    } else {
      // (C) Orphan. The row exists; Stage 5's cleanup gets it later.
      linked = false;
    }

    return {
      receiptId: receipt.id,
      created: true,
      linked,
    };
  });
}

// ─── Auth-gated read (stream-through) ────────────────────────────────

export interface ReceiptForStreaming {
  id: string;
  blobPath: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
}

/**
 * Verify the receipt belongs to a selection owned by `registrationId`,
 * then return enough info for the stream-through endpoint to pipe the
 * bytes back. Returns null if not found OR not owned — callers should
 * treat both as 404 to avoid leaking existence.
 */
export async function getReceiptForAttendee(
  receiptId: string,
  registrationId: string
): Promise<ReceiptForStreaming | null> {
  // PhaseReceipt has a 0..1 back-ref to AttendeeSelection via
  // selection?.  The selection holds the FK; we join via it.
  const receipt = await prisma.phaseReceipt.findUnique({
    where: { id: receiptId },
    include: { selection: { select: { registrationId: true } } },
  });
  if (!receipt) return null;
  if (receipt.selection?.registrationId !== registrationId) return null;
  return {
    id: receipt.id,
    blobPath: receipt.blobPath,
    mimeType: receipt.mimeType,
    originalName: receipt.originalName,
    sizeBytes: receipt.sizeBytes,
  };
}

/**
 * Admin variant. The receipt must belong to a selection on a phase on
 * the given event. The route handler authorises the admin via
 * authorizeEvent({ module: "postRegPhases" }) before calling this.
 */
export async function getReceiptForAdmin(
  receiptId: string,
  eventId: string
): Promise<ReceiptForStreaming | null> {
  const receipt = await prisma.phaseReceipt.findUnique({
    where: { id: receiptId },
    include: {
      selection: { select: { phase: { select: { eventId: true } } } },
    },
  });
  if (!receipt) return null;
  if (receipt.selection?.phase.eventId !== eventId) return null;
  return {
    id: receipt.id,
    blobPath: receipt.blobPath,
    mimeType: receipt.mimeType,
    originalName: receipt.originalName,
    sizeBytes: receipt.sizeBytes,
  };
}

/**
 * Convenience for routes — fetches the stream object from Blob.
 * Throws if the blob doesn't exist (shouldn't happen for a row in our
 * DB, but the orphan-cleanup window or a manual blob delete could
 * produce it).
 */
export async function openReceiptStream(receipt: ReceiptForStreaming) {
  return streamPrivateBlob(receipt.blobPath);
}

// ─── Attendee delete ─────────────────────────────────────────────────

export class ReceiptNotFoundError extends Error {
  readonly code = "RECEIPT_NOT_FOUND";
  constructor() {
    super("Receipt not found.");
  }
}

// ─── Stage 5: orphan cleanup (cron) ──────────────────────────────────

export interface OrphanCleanupResult {
  scanned: number;
  deletedRows: number;
  deletedBlobs: number;
  blobErrors: number;
}

/**
 * Nightly cleanup: removes PhaseReceipt rows that aren't linked to
 * any AttendeeSelection and are older than the grace window. Each
 * orphan's blob is deleted best-effort; failures get counted in
 * `blobErrors` but don't block the DB row delete (the row gets
 * re-scanned on the next run if the blob delete recovers).
 *
 * Grace window is 24h by default to avoid racing a freshly-uploaded
 * receipt mid-write (between the blob landing and the webhook
 * linking the row).
 *
 * Trigger paths for orphans:
 *   - writeReceiptIdempotent case (C): race-lost / out-of-order
 *     retry where the row was inserted but the selection already
 *     pointed elsewhere.
 *   - adminWriteSelectionsWithCleanup: when admin replaces an
 *     attendee's selections, old receipts are deleted via the row +
 *     blob synchronously, but a blob-delete failure leaves an
 *     orphaned blob — cleanup catches it.
 *   - clearSelectionForAdmin: same as above.
 */
export async function cleanupOrphanReceipts(
  graceMs: number = 24 * 60 * 60 * 1000
): Promise<OrphanCleanupResult> {
  const cutoff = new Date(Date.now() - graceMs);

  // Find orphans: no selection back-ref AND older than the cutoff.
  // The Prisma relation `selection` is the 0..1 back-ref defined on
  // PhaseReceipt; filtering `selection: null` is the orphan condition.
  const orphans = await prisma.phaseReceipt.findMany({
    where: {
      selection: null,
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
        "[cleanupOrphanReceipts] blob delete failed:",
        orphan.blobPath,
        err
      );
      // Keep going — we still try to delete the DB row so the next
      // run doesn't re-attempt the same blob endlessly. If the row
      // delete also fails, this orphan gets re-scanned tomorrow.
    }
    try {
      await prisma.phaseReceipt.delete({ where: { id: orphan.id } });
      deletedRows += 1;
    } catch (err) {
      console.warn(
        "[cleanupOrphanReceipts] row delete failed:",
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

export class ReceiptDeleteNotAllowedError extends Error {
  readonly code = "RECEIPT_DELETE_NOT_ALLOWED";
  constructor() {
    super(
      "This phase doesn't allow changes once submitted. Contact your organizer to delete the receipt."
    );
  }
}

/**
 * Delete a receipt as the owning attendee. Allowed only when the
 * phase has `allowChangeAfterSubmit: true`. Deletes the blob
 * synchronously (best-effort), removes the row, and nulls the
 * selection's FK so a fresh upload can re-link.
 */
export async function deleteReceiptForAttendee(
  receiptId: string,
  registrationId: string
): Promise<{ selection: AttendeeSelection }> {
  const receipt = await prisma.phaseReceipt.findUnique({
    where: { id: receiptId },
    include: {
      selection: {
        select: {
          id: true,
          registrationId: true,
          phase: { select: { allowChangeAfterSubmit: true } },
        },
      },
    },
  });
  if (!receipt) throw new ReceiptNotFoundError();
  if (receipt.selection?.registrationId !== registrationId) {
    // Don't leak existence — same response as not-found.
    throw new ReceiptNotFoundError();
  }
  if (!receipt.selection.phase.allowChangeAfterSubmit) {
    throw new ReceiptDeleteNotAllowedError();
  }

  // Best-effort blob delete. Stage 5's cleanup picks up the
  // orphan if this fails.
  try {
    await deleteBlob(receipt.blobPath);
  } catch (err) {
    console.warn("[receipt] blob delete failed:", receipt.blobPath, err);
  }

  // FK on AttendeeSelection.receiptFileId is set to SetNull on delete
  // (per schema), so the row deletion automatically unlinks. We still
  // re-read the selection after to return the post-delete state.
  await prisma.phaseReceipt.delete({ where: { id: receipt.id } });
  const selection = await prisma.attendeeSelection.findUnique({
    where: { id: receipt.selection.id },
  });
  if (!selection) throw new ReceiptNotFoundError();
  return { selection };
}
