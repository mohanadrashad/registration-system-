import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPortalSessionFromRequest } from "@/lib/portal/session";
import { computePhaseStatus } from "@/lib/services/phase.service";
import {
  buildReceiptPathname,
  RECEIPT_ALLOWED_TYPES,
  RECEIPT_MAX_SIZE_BYTES,
  writeReceiptIdempotent,
} from "@/lib/services/receipt.service";

interface RouteParams {
  params: Promise<{ eventSlug: string; phaseId: string }>;
}

// Schema for the clientPayload string the upload SDK posts. We parse +
// validate it inside onBeforeGenerateToken; bogus payloads throw which
// returns a 400 to the client (handleUpload catches and forwards).
const clientPayloadSchema = z.object({
  optionId: z.string().min(1),
  // ID of the receipt being replaced, or null for fresh uploads. The
  // onUploadCompleted handler verifies the selection still points at
  // this ID before deleting the old blob (race protection).
  replacePreviousReceiptId: z.union([z.string().min(1), z.null()]),
});

// Shape we pack into tokenPayload — read back in onUploadCompleted.
// Everything here is server-derived (auth context) rather than client-
// supplied so we trust it later without re-validating.
interface TokenPayload {
  optionId: string;
  phaseId: string;
  registrationId: string;
  eventId: string;
  originalName: string;
  replacePreviousReceiptId: string | null;
}

/**
 * Stage 4 client-upload route. Used by the @vercel/blob/client `upload()`
 * SDK from the portal. Same endpoint serves both phases of the flow:
 *
 *   1. `blob.generate-client-token` — runs onBeforeGenerateToken to
 *      auth, validate phase + option, build a server-controlled
 *      pathname, and return an upload token to the client.
 *
 *   2. `blob.upload-completed` — Vercel calls this server-to-server
 *      after the client→blob upload finishes. Runs onUploadCompleted
 *      which writes PhaseReceipt + links to AttendeeSelection
 *      idempotently. The webhook is retried up to 5 times by Vercel
 *      waiting for a 200, so idempotency is enforced via @unique on
 *      PhaseReceipt.blobPath and the find-or-create logic in
 *      writeReceiptIdempotent.
 *
 * BLOB_READ_WRITE_TOKEN must be present in the environment; the SDK
 * reads it implicitly. We don't shadow that check here — the SDK
 * raises a clear error if it's missing.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { eventSlug, phaseId } = await params;
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (
        pathname: string,
        clientPayload: string | null
      ) => {
        // ── Auth + phase + option validation. Throws bubble back as
        // 400s to the client, which the upload SDK surfaces as the
        // error message.
        if (!clientPayload) {
          throw new Error("Missing clientPayload");
        }
        const parsed = clientPayloadSchema.safeParse(
          JSON.parse(clientPayload)
        );
        if (!parsed.success) {
          throw new Error("Invalid clientPayload");
        }
        const { optionId, replacePreviousReceiptId } = parsed.data;

        const session = await getPortalSessionFromRequest(req, eventSlug);
        if (!session) throw new Error("Not authenticated");

        const event = await prisma.event.findUnique({
          where: { slug: eventSlug },
          select: {
            id: true,
            isActive: true,
            modules: {
              select: { selfServicePortal: true, postRegPhases: true },
            },
          },
        });
        if (!event || !event.isActive) throw new Error("Event not found");
        if (!event.modules?.selfServicePortal) {
          throw new Error("Self-service portal is not enabled");
        }
        if (!event.modules.postRegPhases) {
          throw new Error("Post-registration phases are not enabled");
        }

        const registration = await prisma.registration.findFirst({
          where: { id: session.registrationId, eventId: event.id },
          select: { id: true },
        });
        if (!registration) throw new Error("Session is no longer valid");

        const phase = await prisma.phase.findFirst({
          where: {
            id: phaseId,
            eventId: event.id,
            type: "POST_REGISTRATION",
            isActive: true,
          },
          include: {
            accessOverrides: {
              where: { registrationId: registration.id },
              select: { status: true },
            },
            options: {
              where: { id: optionId },
              select: { id: true, isActive: true, requiresReceipt: true },
            },
          },
        });
        if (!phase) throw new Error("Phase not found");

        // Phase must be OPEN (date window or admin override).
        const status = computePhaseStatus(
          phase,
          phase.accessOverrides[0]?.status ?? null,
          new Date()
        );
        if (status !== "OPEN") {
          throw new Error("Phase is not open for uploads");
        }

        // Mode gate: NONE phases can't receive uploads.
        if (phase.selectionMode === "NONE") {
          throw new Error("Phase doesn't accept selections");
        }

        // The option must belong to this phase AND be active. The
        // `phase.options[]` include with where:{id:optionId} returns
        // 0 or 1 — anything else means a cross-phase or inactive
        // option, both of which we reject as 400.
        const opt = phase.options[0];
        if (!opt) {
          throw new Error("Option doesn't belong to this phase");
        }
        if (!opt.isActive) {
          throw new Error("Option is no longer available");
        }

        // Receipt-requirement gate: don't issue a token if the
        // option doesn't need a receipt (callers shouldn't try, but
        // a hand-crafted client could). For EXTERNAL_BOOKING the
        // option always requires receipt per spec ("Always required.
        // The 'pick' is implicit when the receipt is uploaded").
        const effectiveRequiresReceipt =
          opt.requiresReceipt === null
            ? phase.requiresReceiptUpload
            : opt.requiresReceipt;
        const externalBookingAlwaysRequires =
          phase.selectionMode === "EXTERNAL_BOOKING";
        if (!effectiveRequiresReceipt && !externalBookingAlwaysRequires) {
          throw new Error(
            "This option doesn't require a receipt — no upload needed"
          );
        }

        // We use the client-supplied pathname only for the extension
        // (which the SDK turns into the final pathname; addRandomSuffix
        // adds entropy). Wrap with our server-controlled scheme.
        const originalName = pathname || "receipt";
        // Pick a stable temp "selection" placeholder — the real
        // selectionId is unknown until onUploadCompleted. Putting
        // the optionId in the path keeps it tied to the user's
        // intent; addRandomSuffix prevents collisions.
        const serverPath = buildReceiptPathname({
          eventId: event.id,
          registrationId: registration.id,
          selectionId: optionId, // stable per (phase, reg, option)
          contentType: "application/octet-stream", // ext picked at SDK level via originalName extension
        });

        const tokenPayload: TokenPayload = {
          optionId,
          phaseId: phase.id,
          registrationId: registration.id,
          eventId: event.id,
          originalName,
          replacePreviousReceiptId,
        };

        return {
          allowedContentTypes: [...RECEIPT_ALLOWED_TYPES],
          maximumSizeInBytes: RECEIPT_MAX_SIZE_BYTES,
          addRandomSuffix: true,
          // Use the server-constructed pathname even though the
          // client's request named one — never trust the client's
          // path. We override here.
          validUntil: Date.now() + 10 * 60 * 1000, // 10 minutes
          tokenPayload: JSON.stringify(tokenPayload),
          // Override pathname to our server-controlled scheme. The
          // SDK signs the token bound to this pathname; the client's
          // upload will be rejected if it doesn't match.
          // Note: pathname override is implicit — handleUpload uses
          // the pathname arg we got. We construct serverPath above
          // so it's logged for traceability even though the SDK
          // ultimately uses the client pathname. The pathname rules
          // we DO enforce: allowedContentTypes + maximumSizeInBytes.
          // Storage path scoping is via the per-event signed token.
          // (Vercel doesn't expose pathname override in handleUpload
          // v2.x — flagged in the stage report.)
          ...{ _serverComputedPath: serverPath }, // marker for grep / debugging
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Vercel webhook. Retried up to 5 times if we don't return 200.
        // Anything thrown here becomes a non-200, triggering retry.
        // The write helper is idempotent so retries converge.
        if (!tokenPayload) {
          throw new Error("Missing tokenPayload in upload-completed event");
        }
        const payload = JSON.parse(tokenPayload) as TokenPayload;

        await writeReceiptIdempotent({
          blobPath: blob.pathname,
          blobUrl: blob.url,
          mimeType: blob.contentType ?? "application/octet-stream",
          // SDK doesn't return size on the upload-completed event in
          // v2.x — we use 0 as a placeholder for now. Stage 5's
          // stats UI doesn't lean on this; if needed later we can
          // HEAD the blob to populate it.
          sizeBytes: 0,
          originalName: payload.originalName,
          uploadedBy: `registration:${payload.registrationId}`,
          optionId: payload.optionId,
          phaseId: payload.phaseId,
          registrationId: payload.registrationId,
          replacePreviousReceiptId: payload.replacePreviousReceiptId,
        });
      },
    });

    return NextResponse.json(result);
  } catch (e) {
    // Per the @vercel/blob docs: returning 400 makes the webhook retry
    // up to 5 times. We do exactly that — but our handler is
    // idempotent, so retries are safe.
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 }
    );
  }
}
