/**
 * GET /api/events/[eventId]/files/[fileId]/stream
 *
 * Admin-side stream-through read for a RegistrationFile. Pipes the
 * private blob bytes back to the browser with the stored Content-Type
 * and `Content-Disposition: inline`, so PDFs / images render in a new
 * tab rather than triggering a forced download.
 *
 * Threat model. Private store: blob URLs are NEVER exposed to clients.
 * Every read goes through this server route, which validates the
 * admin's per-event access on every request. Revoking the admin's
 * session (logout, removed from EventMember) immediately invalidates
 * further reads — no signed-URL TTL window to wait out.
 *
 * Auth. `authorizeEvent(eventId)` defaults to role: "authenticated"
 * (any event member — VIEWER and above). FILE fields live on the core
 * form-builder module which defaults to true for every event, so no
 * module gate is appropriate here: if a VIEWER can see the filename
 * on the attendee detail page, they can stream the file (same surface,
 * not a privilege escalation).
 *
 * Mirrors the PhaseReceipt admin stream pattern at
 * src/app/api/events/[eventId]/receipts/[receiptId]/route.ts. Same
 * response headers, same error mapping. The only differences are:
 *   - no module gate (PhaseReceipt uses `{ module: "postRegPhases" }`
 *     because phase selections is a gated feature),
 *   - service lookup hits RegistrationFile instead of PhaseReceipt.
 */

import { NextRequest, NextResponse } from "next/server";
import { authorizeEvent } from "@/lib/api-auth";
import {
  getRegistrationFileForAdmin,
  openRegistrationFileStream,
} from "@/lib/services/registration-file.service";

interface RouteParams {
  params: Promise<{ eventId: string; fileId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { eventId, fileId } = await params;

  const auth = await authorizeEvent(eventId);
  if (auth instanceof NextResponse) return auth;

  const file = await getRegistrationFileForAdmin(fileId, eventId);
  if (!file) {
    // Covers (a) row missing and (b) cross-event mismatch — both
    // return 404 so we don't leak existence to a probe trying random
    // fileIds against different events.
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  let blob;
  try {
    blob = await openRegistrationFileStream(file);
  } catch (e) {
    // Row exists but blob is gone (orphan-cleanup window, manual
    // dashboard deletion). 410 Gone reflects the row-without-bytes
    // state honestly; the admin can re-fetch the registration to see
    // the row is still listed but the file is unrecoverable.
    console.error("[admin registration-file stream] blob fetch failed:", e);
    return NextResponse.json(
      { error: "File is no longer available" },
      { status: 410 }
    );
  }

  // RFC 6266 filename* form so Arabic / non-ASCII filenames render
  // correctly across browsers. The same Stage 2 smoke test exercised
  // an Arabic-named PDF (`أفكار_حفل_لين_التاسع-مهند.pdf`) and the
  // encodeURIComponent pass yields a header browsers accept.
  const safeName = encodeURIComponent(file.originalName);
  return new Response(blob.stream, {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${safeName}`,
      // Personal data — never cache. The next request might be from a
      // different admin or a logged-out browser; cached bytes would
      // bypass the per-request authorizeEvent check.
      "Cache-Control": "private, no-store",
    },
  });
}
