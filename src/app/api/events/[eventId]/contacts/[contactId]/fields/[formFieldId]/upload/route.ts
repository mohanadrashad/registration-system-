/**
 * POST /api/events/[eventId]/contacts/[contactId]/fields/[formFieldId]/upload
 *
 * Admin-side upload of a NEW file into a FILE field that is currently
 * empty (after an admin Remove, or a visitor who never uploaded). The
 * empty-field counterpart to the replace route — same @vercel/blob
 * `handleUpload` shape (one route serves both `blob.generate-client-token`
 * and `blob.upload-completed`), differing only in:
 *   - The URL keys on [formFieldId], not [fileId]: there is no existing
 *     file to address. Validation walks contact → registration (1:1) +
 *     formField via validateAdminUploadTarget.
 *   - Webhook completion runs completeAdminCreateFile (INSERT only — no
 *     old row to delete, no old blob to clean up).
 *   - The new row's uploadedBy = "admin-new:<actorId>" so provenance
 *     renders "Uploaded by <admin>" without the "(replaced)" clause.
 *
 * Auth lives INSIDE onBeforeGenerateToken (token-mint only) — the
 * upload-completed webhook fires from Vercel's servers with no admin
 * cookie, so authorizing at the handler top would 401 the webhook and
 * orphan the blob. Same load-bearing pattern as the replace route.
 */

import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { head } from "@vercel/blob";
import { authorizeEvent } from "@/lib/api-auth";
import {
  parseFileFieldMetadata,
  maxSizeMBToBytes,
} from "@/lib/validations/file-field-metadata";
import {
  AdminFileNotReplaceableError,
  completeAdminCreateFile,
  validateAdminUploadTarget,
} from "@/lib/services/registration-file.service";
import { deleteBlob } from "@/lib/blob";

interface RouteParams {
  params: Promise<{
    eventId: string;
    contactId: string;
    formFieldId: string;
  }>;
}

// Server-derived bag round-tripped through Vercel via tokenPayload.
// Never client-supplied. Read back in onUploadCompleted.
interface TokenPayload {
  eventId: string;
  contactId: string;
  registrationId: string;
  formField: { id: string; name: string };
  actorId: string;
  // Per-field limits captured at token time — re-validated on completion
  // so a metadata change between mint and webhook can't sneak a wrong file.
  allowedMimeTypes: string[];
  maxSizeBytes: number;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { eventId, contactId, formFieldId } = await params;

  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,

      onBeforeGenerateToken: async (pathname: string) => {
        // Per-event auth + editor role. SUPER_ADMIN bypasses. Throws
        // bubble back to the SDK as 4xx; the client surfaces the message
        // as a toast. NOT at the handler top — see file header.
        const ctx = await authorizeEvent(eventId, { role: "editor" });
        if (ctx instanceof NextResponse) {
          throw new Error(ctx.status === 401 ? "Unauthorized" : "Forbidden");
        }
        const actorId = ctx.session.user.id;

        let target;
        try {
          target = await validateAdminUploadTarget({
            eventId,
            contactId,
            formFieldId,
          });
        } catch (e) {
          if (e instanceof AdminFileNotReplaceableError) {
            throw new Error(e.message);
          }
          throw e;
        }

        const fileMetadata = parseFileFieldMetadata(target.formField.metadata);
        const maxSizeBytes = maxSizeMBToBytes(fileMetadata.maxSizeMB);
        const allowedMimeTypes = [...fileMetadata.allowedMimeTypes];

        // The SDK doesn't let us override the blob pathname (v2.3.3
        // ceiling — see the visitor route). Blobs land flat at bucket
        // root; cross-event isolation lives at the app layer.
        const originalName = (pathname || "upload").slice(0, 200);
        void originalName; // read back from the blob on completion

        const tokenPayload: TokenPayload = {
          eventId,
          contactId,
          registrationId: target.registrationId,
          formField: {
            id: target.formField.id,
            name: target.formField.name,
          },
          actorId,
          allowedMimeTypes,
          maxSizeBytes,
        };

        return {
          allowedContentTypes: allowedMimeTypes,
          maximumSizeInBytes: maxSizeBytes,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000, // 10 min
          tokenPayload: JSON.stringify(tokenPayload),
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload) {
          throw new Error("Missing tokenPayload in upload-completed event");
        }
        const payload = JSON.parse(tokenPayload) as TokenPayload;

        // If anything below throws, best-effort delete the just-uploaded
        // blob before re-throwing — keeps orphan storage small. del() is
        // idempotent on missing.
        const cleanupNewBlobOnFailure = async () => {
          try {
            await deleteBlob(blob.pathname);
          } catch (delErr) {
            console.warn(
              "[admin upload] failed to clean up new blob after webhook failure (storage leak):",
              blob.pathname,
              delErr
            );
          }
        };

        try {
          const mimeType = blob.contentType ?? "application/octet-stream";
          if (!payload.allowedMimeTypes.includes(mimeType)) {
            throw new Error(
              `Disallowed content type ${mimeType} for field ${payload.formField.id}`
            );
          }

          // upload-completed doesn't carry size; HEAD the blob to read it.
          let sizeBytes = 0;
          try {
            const headResult = await head(blob.url);
            sizeBytes = headResult.size;
          } catch (err) {
            console.warn(
              "[admin upload] head() failed; storing size=0",
              blob.pathname,
              err
            );
          }
          if (sizeBytes > payload.maxSizeBytes) {
            throw new Error(
              `File exceeds max size for field ${payload.formField.id}`
            );
          }

          const originalName = stripRandomSuffix(blob.pathname);

          await completeAdminCreateFile({
            registrationId: payload.registrationId,
            contactId: payload.contactId,
            formField: payload.formField,
            newBlob: {
              pathname: blob.pathname,
              url: blob.url,
              mimeType,
              sizeBytes,
              originalName,
            },
            actorId: payload.actorId,
          });
        } catch (err) {
          await cleanupNewBlobOnFailure();
          throw err;
        }
      },
    });

    return NextResponse.json(result);
  } catch (e) {
    // Returning 400 makes the webhook retry up to 5 times. completeAdmin-
    // CreateFile is insert-only and the catch above deletes the new blob
    // on first failure, so retries fail their HEAD lookup and bail
    // cleanly: end state is blob deleted, no row created, admin retries.
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/**
 * Vercel appends a random suffix to blob pathnames when
 * addRandomSuffix:true ("upload-abc123def.pdf"). For display we strip
 * back to the original basename. Conservative: if the pathname doesn't
 * match the "<base>-<suffix>.<ext>" shape, return as-is. Same helper as
 * the replace route.
 */
function stripRandomSuffix(pathname: string): string {
  const dotIdx = pathname.lastIndexOf(".");
  if (dotIdx < 0) return pathname;
  const stem = pathname.slice(0, dotIdx);
  const ext = pathname.slice(dotIdx);
  const dashIdx = stem.lastIndexOf("-");
  if (dashIdx < 0) return pathname;
  return stem.slice(0, dashIdx) + ext;
}
