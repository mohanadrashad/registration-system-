/**
 * POST /api/register/[eventSlug]/upload
 *
 * Single Vercel Blob `handleUpload` route for the public registration
 * flow. Same endpoint handles both event types in the SDK contract:
 *
 *   1. `blob.generate-client-token` — `onBeforeGenerateToken` runs:
 *      validates the visitor's reg_upload_session cookie, looks up
 *      the FormField by id (must be FILE type on this event), reads
 *      per-field FileFieldMetadata for max-size + allowed MIME types,
 *      and mints a Vercel-side upload token that enforces both.
 *
 *   2. `blob.upload-completed` — `onUploadCompleted` runs after the
 *      client → blob upload finishes. Re-validates mimeType against
 *      the FormField's metadata (defense-in-depth — the SDK already
 *      enforced it at the token tier), HEADs the blob to fetch the
 *      actual size, and writes a RegistrationFile row idempotently.
 *
 * Structurally cloned from
 * src/app/api/portal/[eventSlug]/phases/[phaseId]/receipts/upload/route.ts.
 * Differences from that file:
 *   - Visitor auth is cookie-based (reg_upload_session), not session.
 *   - Per-field size/MIME limits come from FormField.metadata, not
 *     hardcoded receipt constants.
 *   - sizeBytes is populated via head() on completion rather than
 *     written as 0 — FILE fields render the size to admins and
 *     visitors, receipts didn't.
 *   - No replace-id logic: pre-submission replace deletes via the
 *     DELETE route, then a fresh upload runs through this route.
 */

import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { head } from "@vercel/blob";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { readUploadSessionId } from "@/lib/registration/upload-session";
import {
  parseFileFieldMetadata,
  maxSizeMBToBytes,
} from "@/lib/validations/file-field-metadata";
import { writeRegistrationFileIdempotent } from "@/lib/services/registration-file.service";

interface RouteParams {
  params: Promise<{ eventSlug: string }>;
}

// The clientPayload string the SDK posts during token mint. Carries
// just the field id — everything else is server-derived.
const clientPayloadSchema = z.object({
  formFieldId: z.string().min(1),
});

// Server-derived bag we round-trip through Vercel via the SDK's
// `tokenPayload`. Read back in onUploadCompleted; never client-supplied.
interface TokenPayload {
  eventId: string;
  eventSlug: string;
  formFieldId: string;
  uploadSessionId: string;
  originalName: string;
  // The per-field limits at token time — we re-validate against them
  // on completion so a metadata change between mint and webhook can't
  // sneak through an over-size or wrong-type file.
  allowedMimeTypes: string[];
  maxSizeBytes: number;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { eventSlug } = await params;
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,

      onBeforeGenerateToken: async (
        pathname: string,
        clientPayload: string | null
      ) => {
        // Throws here bubble back as 400s to the client. The visitor
        // sees the error message the SDK forwards.
        if (!clientPayload) {
          throw new Error("Missing clientPayload");
        }
        const parsed = clientPayloadSchema.safeParse(JSON.parse(clientPayload));
        if (!parsed.success) {
          throw new Error("Invalid clientPayload");
        }
        const { formFieldId } = parsed.data;

        const uploadSessionId = readUploadSessionId(req);
        if (!uploadSessionId) {
          // Cookie missing or tampered — visitor needs to reload the
          // registration page so the GET handler issues a fresh one.
          throw new Error("Upload session not established");
        }

        const event = await prisma.event.findUnique({
          where: { slug: eventSlug },
          select: { id: true, isActive: true },
        });
        if (!event || !event.isActive) throw new Error("Event not found");

        const field = await prisma.formField.findUnique({
          where: { id: formFieldId },
          select: {
            id: true,
            eventId: true,
            type: true,
            isActive: true,
            metadata: true,
          },
        });
        if (!field || field.eventId !== event.id) {
          throw new Error("Form field not found on this event");
        }
        if (field.type !== "FILE") {
          throw new Error("Form field is not a FILE field");
        }
        if (!field.isActive) {
          throw new Error("Form field is not active");
        }

        const fileMetadata = parseFileFieldMetadata(field.metadata);
        const maxSizeBytes = maxSizeMBToBytes(fileMetadata.maxSizeMB);
        const allowedMimeTypes = [...fileMetadata.allowedMimeTypes];

        // pathname is the client-supplied basename ("CR_2026.pdf"). We
        // keep it for display via originalName; the SDK does its own
        // pathname handling at the blob layer (addRandomSuffix below
        // guarantees uniqueness). Storage-path security comes from the
        // signed token, not the path string.
        const originalName = (pathname || "upload").slice(0, 200);

        const tokenPayload: TokenPayload = {
          eventId: event.id,
          eventSlug,
          formFieldId: field.id,
          uploadSessionId,
          originalName,
          allowedMimeTypes,
          maxSizeBytes,
        };

        return {
          allowedContentTypes: allowedMimeTypes,
          maximumSizeInBytes: maxSizeBytes,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000, // 10 minutes
          tokenPayload: JSON.stringify(tokenPayload),
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Vercel webhook. Retried up to 5 times if we don't return
        // 200. The write helper is idempotent so retries converge.
        if (!tokenPayload) {
          throw new Error("Missing tokenPayload in upload-completed event");
        }
        const payload = JSON.parse(tokenPayload) as TokenPayload;

        const mimeType = blob.contentType ?? "application/octet-stream";
        if (!payload.allowedMimeTypes.includes(mimeType)) {
          // Defense-in-depth — should never trigger because the SDK
          // refuses non-allowed content types at the token tier. If
          // we ever see this in logs, something's off with the SDK or
          // a metadata change raced our token mint.
          throw new Error(
            `Disallowed content type ${mimeType} for field ${payload.formFieldId}`
          );
        }

        // Vercel's upload-completed payload doesn't carry the size;
        // HEAD the blob to populate it. ~50ms round-trip, worth it so
        // admins see "(482 KB)" in the UI without a second query at
        // render time.
        //
        // Deliberate deviation from PhaseReceipt. PhaseReceipt's
        // onUploadCompleted (src/app/api/portal/.../receipts/upload/route.ts)
        // writes sizeBytes: 0 because nothing in the portal/admin UI
        // renders the size of a receipt — admins see a filename and a
        // View button, that's it. FILE field is the opposite: Stage 2's
        // visitor upload control shows "(482 KB)" inline next to the
        // filename in the uploaded state, and Stage 3's attendee detail
        // page shows the same. Querying the blob at render time would
        // be a per-row N+1 against Vercel Blob; HEADing once on upload
        // and caching the result on the RegistrationFile row is
        // strictly cheaper. If the SDK ever surfaces size in the
        // upload-completed payload, drop this HEAD and use the
        // payload field instead.
        let sizeBytes = 0;
        try {
          const headResult = await head(blob.url);
          sizeBytes = headResult.size;
        } catch (err) {
          console.warn(
            "[registration-file/upload] head() failed; storing size=0",
            blob.pathname,
            err
          );
        }
        if (sizeBytes > payload.maxSizeBytes) {
          // Equally defense-in-depth — the SDK enforced the cap.
          throw new Error(
            `File exceeds max size for field ${payload.formFieldId}`
          );
        }

        await writeRegistrationFileIdempotent({
          blobPath: blob.pathname,
          blobUrl: blob.url,
          mimeType,
          sizeBytes,
          originalName: payload.originalName,
          formFieldId: payload.formFieldId,
          uploadSessionId: payload.uploadSessionId,
        });
      },
    });

    return NextResponse.json(result);
  } catch (e) {
    // Per the @vercel/blob docs: returning 400 makes the webhook
    // retry up to 5 times. Our handler is idempotent so retries are
    // safe; we surface the error message to help debugging.
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 }
    );
  }
}
