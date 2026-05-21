/**
 * GET /api/register/[eventSlug]/files?formFieldId=...
 *
 * Visitor-facing lookup the public upload control polls after the
 * Vercel Blob SDK's `upload()` resolves. Returns the most-recent
 * not-yet-submitted RegistrationFile for the (cookie session, field)
 * pair, or `{ file: null }` when the webhook hasn't fired yet.
 *
 * Auth: reg_upload_session cookie. Mirrors the DELETE route's "session
 * mismatch returns 404" leak-prevention by simply scoping the query
 * to the cookie's sessionId; a probe with no cookie hits 401 first.
 *
 * No event-membership check here — the cookie is what grants access,
 * and the eventSlug in the URL is purely for routing symmetry with the
 * other public register endpoints.
 */

import { NextRequest, NextResponse } from "next/server";
import { readUploadSessionId } from "@/lib/registration/upload-session";
import { getCurrentPreSubmissionFile } from "@/lib/services/registration-file.service";

interface RouteParams {
  params: Promise<{ eventSlug: string }>;
}

export async function GET(req: NextRequest, _ctx: RouteParams) {
  const url = new URL(req.url);
  const formFieldId = url.searchParams.get("formFieldId");
  if (!formFieldId) {
    return NextResponse.json(
      { error: "formFieldId is required" },
      { status: 400 }
    );
  }

  const uploadSessionId = readUploadSessionId(req);
  if (!uploadSessionId) {
    return NextResponse.json(
      { error: "Upload session not established" },
      { status: 401 }
    );
  }

  const file = await getCurrentPreSubmissionFile({
    uploadSessionId,
    formFieldId,
  });

  if (!file) {
    return NextResponse.json({ file: null });
  }
  return NextResponse.json({
    file: {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      uploadedAt: file.uploadedAt.toISOString(),
    },
  });
}
