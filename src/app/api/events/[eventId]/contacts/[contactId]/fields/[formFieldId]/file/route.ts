/**
 * GET /api/events/[eventId]/contacts/[contactId]/fields/[formFieldId]/file
 *
 * Read-back for the admin file cell's post-upload poll. The @vercel/blob
 * `upload()` resolves when bytes hit storage, BEFORE the onUploadCompleted
 * webhook writes the RegistrationFile row — so a single immediate refetch
 * races the webhook (Upload shows "No file uploaded", Replace shows the
 * stale old file, until a manual refresh). The cell polls this endpoint
 * until the field reflects the new file, mirroring the visitor-side
 * waitForUploadedFile loop in file-upload-control.tsx.
 *
 * Response: { file: { fileId, filename, mimeType, sizeBytes } | null }.
 * `file: null` is a NORMAL transient state during the webhook window, not
 * an error — the poller keeps going. Cross-event / cross-contact / non-FILE
 * mismatches also return null (existence doesn't leak).
 *
 * Auth: authorizeEvent(eventId) defaults to "authenticated" — same "if you
 * can see the filename you can read it" posture as the stream/meta routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { authorizeEvent } from "@/lib/api-auth";
import { getAdminCurrentFile } from "@/lib/services/registration-file.service";

interface RouteParams {
  params: Promise<{ eventId: string; contactId: string; formFieldId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { eventId, contactId, formFieldId } = await params;

  const auth = await authorizeEvent(eventId);
  if (auth instanceof NextResponse) return auth;

  const file = await getAdminCurrentFile({ eventId, contactId, formFieldId });
  return NextResponse.json({ file });
}
