/**
 * DELETE /api/events/[eventId]/contacts/[contactId]/files/[fileId]
 *
 * Admin-side removal of an existing post-submission FILE answer.
 * Single-phase (no upload, no webhook) — just delete the row, null
 * out the formData/metadata keys, and best-effort delete the blob.
 *
 * Cross-event + cross-contact guard lives in the service layer
 * (adminRemoveFile). Any mismatch — wrong event, wrong contact, wrong
 * file type, or a pre-submission file (which belongs to the visitor's
 * own DELETE endpoint, not this admin one) — returns 404 uniformly
 * so we don't leak which check failed.
 *
 * Removing a required FILE puts the registration in a "missing
 * required data" state. Per spec: informational only. The Chunk 6
 * warning banner surfaces it; nothing in check-in / badge / email
 * paths rejects on the missing field.
 */

import { NextRequest, NextResponse } from "next/server";
import { authorizeEvent } from "@/lib/api-auth";
import {
  AdminFileNotReplaceableError,
  adminRemoveFile,
} from "@/lib/services/registration-file.service";

interface RouteParams {
  params: Promise<{
    eventId: string;
    contactId: string;
    fileId: string;
  }>;
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams
) {
  const { eventId, contactId, fileId } = await params;

  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

  try {
    const { fieldName } = await adminRemoveFile({
      eventId,
      contactId,
      fileId,
      actorId: ctx.session.user.id,
    });
    return NextResponse.json({ success: true, fieldName });
  } catch (e) {
    if (e instanceof AdminFileNotReplaceableError) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }
    console.error("[admin remove file] unexpected error:", e);
    return NextResponse.json(
      { error: "Failed to remove file" },
      { status: 500 }
    );
  }
}
