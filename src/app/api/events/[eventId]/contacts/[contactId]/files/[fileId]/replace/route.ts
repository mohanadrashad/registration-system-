/**
 * POST /api/events/[eventId]/contacts/[contactId]/files/[fileId]/replace
 *
 * Admin-side replacement for a visitor-uploaded FILE field answer.
 * Mirror of the visitor's public upload route at
 * src/app/api/register/[eventSlug]/upload/route.ts. Same @vercel/blob
 * `handleUpload` shape: one route handles both SDK events
 * (`blob.generate-client-token` and `blob.upload-completed`), differs
 * only in:
 *   - Auth is admin NextAuth via authorizeEvent (Stage 2 pattern),
 *     not the reg_upload_session cookie.
 *   - Pre-token validation walks fileId -> registration + formField via
 *     validateAdminReplaceTarget. No new uploads — admin can only
 *     REPLACE an existing file (spec line 41).
 *   - Webhook completion runs the swap transaction via
 *     completeAdminReplaceFile (delete old row, insert new row, mirror
 *     into Registration.formData + Contact.metadata, stamp updater).
 *   - On webhook failure, best-effort delete of the just-uploaded NEW
 *     blob before re-throwing — keeps orphan storage small at the cost
 *     of defeating Vercel's auto-retry on transient failures (per
 *     Stage 3 refinement #1 in the ADMIN_EDIT_FIX_SPEC review).
 *
 * URL slug deviation from spec: spec wording was [formFieldId]; we use
 * [fileId] because Next.js requires the same slug name at the same
 * path position as the DELETE-by-fileId remove route. Mockup #2b
 * confirms admin UI never invokes Replace when no file exists, so the
 * fileId is always known client-side. formFieldId is derived from the
 * fileId during validation.
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
  completeAdminReplaceFile,
  validateAdminReplaceTarget,
} from "@/lib/services/registration-file.service";
import { deleteBlob } from "@/lib/blob";

interface RouteParams {
  params: Promise<{
    eventId: string;
    contactId: string;
    fileId: string;
  }>;
}

// Server-derived bag round-tripped through Vercel via tokenPayload.
// Never client-supplied. Read back in onUploadCompleted.
interface TokenPayload {
  eventId: string;
  contactId: string;
  registrationId: string;
  formField: { id: string; name: string };
  oldFileId: string;
  oldBlobPath: string;
  actorId: string;
  // Per-field limits at token time — re-validated on completion so a
  // metadata change between mint and webhook can't sneak a wrong file.
  allowedMimeTypes: string[];
  maxSizeBytes: number;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { eventId, contactId, fileId } = await params;

  // Auth deliberately NOT at the handler top. handleUpload reuses
  // this route URL for TWO events from the @vercel/blob SDK:
  //
  //   1. blob.generate-client-token — fired from the admin's browser
  //      (carries the admin auth cookie).
  //   2. blob.upload-completed       — fired as a webhook from Vercel's
  //      servers (NO admin cookie).
  //
  // Calling authorizeEvent at the top auth-fails the webhook (401),
  // so onUploadCompleted never runs, the swap never happens, and the
  // new blob orphans in storage. Mirroring the visitor route's
  // pattern: auth lives inside onBeforeGenerateToken (token-mint
  // only); the webhook flows through to onUploadCompleted with the
  // trusted tokenPayload that we baked at mint time.

  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,

      onBeforeGenerateToken: async (pathname: string) => {
        // Per-event auth + editor role. SUPER_ADMIN bypasses.
        // Throws bubble back to the SDK as 4xx; the client surfaces
        // the message as a toast.
        const ctx = await authorizeEvent(eventId, { role: "editor" });
        if (ctx instanceof NextResponse) {
          throw new Error(
            ctx.status === 401 ? "Unauthorized" : "Forbidden"
          );
        }
        const actorId = ctx.session.user.id;

        // No clientPayload needed — eventId/contactId/fileId are in the
        // URL. The admin client just calls upload() with a pathname and
        // a file. formFieldId is derived from the fileId server-side.
        let target;
        try {
          target = await validateAdminReplaceTarget({
            eventId,
            contactId,
            fileId,
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

        // The SDK doesn't let us override the blob pathname here
        // (v2.3.3 ceiling — see the comment block in the visitor route).
        // Blobs land flat at bucket root; cross-event isolation lives
        // at the app layer via service-side cross-event guards.
        const originalName = (pathname || "upload").slice(0, 200);

        const tokenPayload: TokenPayload = {
          eventId,
          contactId,
          registrationId: target.registrationId,
          formField: {
            id: target.formField.id,
            name: target.formField.name,
          },
          oldFileId: target.existingFile.id,
          oldBlobPath: target.existingFile.blobPath,
          actorId,
          allowedMimeTypes,
          maxSizeBytes,
        };
        // originalName is captured implicitly by the visitor side too
        // — we read pathname from the blob on completion. No need to
        // bake it into tokenPayload.
        void originalName;

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

        // Refinement #1: if anything below throws, attempt best-effort
        // delete of the just-uploaded new blob before re-throwing.
        // Trade-off: this defeats Vercel's auto-retry on transient
        // failures (the deleted blob can't be re-processed), but keeps
        // orphan storage small. del() is idempotent on missing.
        const cleanupNewBlobOnFailure = async () => {
          try {
            await deleteBlob(blob.pathname);
          } catch (delErr) {
            console.warn(
              "[admin replace] failed to clean up new blob after webhook failure (storage leak):",
              blob.pathname,
              delErr
            );
          }
        };

        try {
          const mimeType = blob.contentType ?? "application/octet-stream";
          if (!payload.allowedMimeTypes.includes(mimeType)) {
            // Defense-in-depth — SDK already enforced at token tier.
            throw new Error(
              `Disallowed content type ${mimeType} for field ${payload.formField.id}`
            );
          }

          // Vercel's upload-completed payload doesn't carry size. HEAD
          // the blob to populate it; same pattern as the visitor route.
          let sizeBytes = 0;
          try {
            const headResult = await head(blob.url);
            sizeBytes = headResult.size;
          } catch (err) {
            console.warn(
              "[admin replace] head() failed; storing size=0",
              blob.pathname,
              err
            );
          }
          if (sizeBytes > payload.maxSizeBytes) {
            throw new Error(
              `File exceeds max size for field ${payload.formField.id}`
            );
          }

          // Filename for display — derived from the blob's pathname.
          // Vercel appends a random suffix when addRandomSuffix:true,
          // so we strip back to the original basename for the UI.
          const originalName = stripRandomSuffix(blob.pathname);

          await completeAdminReplaceFile({
            registrationId: payload.registrationId,
            contactId: payload.contactId,
            formField: payload.formField,
            oldFileId: payload.oldFileId,
            oldBlobPath: payload.oldBlobPath,
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
    // Per @vercel/blob docs: returning 400 makes the webhook retry up
    // to 5 times. Our completion path is NOT idempotent across retries
    // because we delete the old row inside the swap — a successful first
    // attempt followed by a retry would find no oldFileId and fail. The
    // catch-block above deletes the new blob on first failure, so retries
    // will fail HEAD lookups and bail cleanly. End state: blob deleted,
    // no row created, admin sees error toast and retries from scratch.
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 }
    );
  }
}

/**
 * Vercel appends a random suffix to blob pathnames when
 * addRandomSuffix:true ("upload-abc123def.pdf"). For display we want
 * the original basename ("upload.pdf"). The suffix is appended BEFORE
 * the last extension, separated by a hyphen, using a fixed alphabet —
 * we strip everything between the last hyphen and the last dot.
 *
 * Conservative: if the pathname doesn't match the expected
 * "<base>-<suffix>.<ext>" shape, return as-is. Better to show a
 * suffixed name than to mangle a legitimate filename.
 */
function stripRandomSuffix(pathname: string): string {
  // Find the last "." for the extension boundary.
  const dotIdx = pathname.lastIndexOf(".");
  if (dotIdx < 0) return pathname;
  const stem = pathname.slice(0, dotIdx);
  const ext = pathname.slice(dotIdx);
  // Find the last "-" inside the stem.
  const dashIdx = stem.lastIndexOf("-");
  if (dashIdx < 0) return pathname;
  return stem.slice(0, dashIdx) + ext;
}
