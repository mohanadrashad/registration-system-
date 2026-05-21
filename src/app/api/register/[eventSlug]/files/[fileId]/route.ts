/**
 * DELETE /api/register/[eventSlug]/files/[fileId]
 *
 * Visitor-initiated pre-submission file deletion. Used by the Stage-2
 * upload control's Replace and Remove buttons before the form is
 * submitted. After form submission, files become permanent records
 * tied to the Registration row and admin-side flows govern deletion
 * (out of scope for v1).
 *
 * Auth: the reg_upload_session cookie on the request must match the
 * file's uploadSessionId. A mismatch returns 404 (not 403) so we
 * don't leak existence to a different visitor probing fileIds.
 *
 * Best-effort blob delete + DB row delete — failures are logged but
 * don't block the row deletion. The nightly orphan cleanup catches
 * any blob whose row went away successfully but whose blob delete
 * failed; conversely, a successful blob delete with a failed row
 * delete is re-scanned and re-attempted tomorrow.
 */

import { NextRequest, NextResponse } from "next/server";
import { readUploadSessionId } from "@/lib/registration/upload-session";
import {
  deleteRegistrationFileForSession,
  RegistrationFileNotFoundError,
} from "@/lib/services/registration-file.service";

interface RouteParams {
  params: Promise<{ eventSlug: string; fileId: string }>;
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { fileId } = await params;
  // We don't read eventSlug here — file lookup is by id, and the
  // service-layer ownership check (session-cookie match) is what
  // gates deletion. The eventSlug is in the URL so the client can
  // construct a clean per-event endpoint; we ignore it server-side.

  const uploadSessionId = readUploadSessionId(req);
  if (!uploadSessionId) {
    return NextResponse.json(
      { error: "Upload session not established" },
      { status: 401 }
    );
  }

  try {
    await deleteRegistrationFileForSession(fileId, uploadSessionId);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof RegistrationFileNotFoundError) {
      // Covers (a) file truly missing and (b) session mismatch /
      // already-submitted file — both return 404 to avoid leaking
      // existence.
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    console.error("[registration-file/delete] unexpected error:", e);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}
