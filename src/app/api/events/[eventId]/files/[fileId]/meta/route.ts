/**
 * GET /api/events/[eventId]/files/[fileId]/meta
 *
 * Provenance lookup for the edit-dialog FILE branch (Mockup 1b/2). Returns
 * a UI-renderable shape derived from RegistrationFile.uploadedBy +
 * uploadedAt, with the admin's display name pre-resolved server-side so
 * the client never has to query User directly.
 *
 * Response:
 *   {
 *     "uploadedBy": "visitor" | "admin",
 *     "uploadedByName": string | null,   // null when visitor OR admin
 *                                        // user row was deleted
 *     "uploadedAt": string (ISO 8601),
 *     "wasReplaced": boolean             // true iff uploadedBy === "admin"
 *   }
 *
 * Auth: authorizeEvent(eventId) defaults to "authenticated" — any event
 * member can fetch provenance, matching the stream endpoint's "if you
 * can see the filename you can see the provenance" pattern. SUPER_ADMIN
 * bypasses.
 *
 * 404 on missing or cross-event mismatch (same existence-leak prevention
 * as the stream endpoint).
 */

import { NextRequest, NextResponse } from "next/server";
import { authorizeEvent } from "@/lib/api-auth";
import { getAdminFileProvenance } from "@/lib/services/registration-file.service";

interface RouteParams {
  params: Promise<{ eventId: string; fileId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { eventId, fileId } = await params;

  const auth = await authorizeEvent(eventId);
  if (auth instanceof NextResponse) return auth;

  const provenance = await getAdminFileProvenance({ fileId, eventId });
  if (!provenance) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return NextResponse.json({
    uploadedBy: provenance.uploadedBy,
    uploadedByName: provenance.uploadedByName,
    uploadedAt: provenance.uploadedAt.toISOString(),
    wasReplaced: provenance.wasReplaced,
  });
}
