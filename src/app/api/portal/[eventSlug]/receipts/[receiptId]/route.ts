import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPortalSessionFromRequest } from "@/lib/portal/session";
import {
  deleteReceiptForAttendee,
  getReceiptForAttendee,
  openReceiptStream,
  ReceiptDeleteNotAllowedError,
  ReceiptNotFoundError,
} from "@/lib/services/receipt.service";

interface RouteParams {
  params: Promise<{ eventSlug: string; receiptId: string }>;
}

/**
 * Stream-through endpoint for the receipt owner. Pipes the private
 * blob bytes back to the browser with the stored Content-Type and
 * `Content-Disposition: inline` so the file renders rather than
 * forcing a download.
 *
 * Per the user's instruction: the response NEVER contains the blob
 * URL or pathname; the client only ever sees these bytes via this
 * endpoint, which gates on portal-session ownership.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { eventSlug, receiptId } = await params;

  const session = await getPortalSessionFromRequest(req, eventSlug);
  if (!session) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  // Cross-event guard: verify the session's registration is on THIS
  // event. Catches the case where a cookie from a different event is
  // reused against this route.
  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const registration = await prisma.registration.findFirst({
    where: { id: session.registrationId, eventId: event.id },
    select: { id: true },
  });
  if (!registration) {
    return NextResponse.json(
      { error: "Session is no longer valid" },
      { status: 401 }
    );
  }

  const receipt = await getReceiptForAttendee(receiptId, registration.id);
  if (!receipt) {
    // Same response for "doesn't exist" and "not yours" to avoid
    // leaking existence.
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  let blob;
  try {
    blob = await openReceiptStream(receipt);
  } catch (e) {
    // Blob row exists but file is missing (orphan-cleanup window or
    // manual deletion). Tell the user; don't surface internals.
    console.error("[receipt stream] blob fetch failed:", e);
    return NextResponse.json(
      { error: "Receipt file is no longer available" },
      { status: 410 }
    );
  }

  // Stream the bytes back. We escape the filename for the
  // Content-Disposition header per RFC 6266 — Arabic / non-ASCII
  // filenames need the `filename*` form to render correctly across
  // browsers.
  const safeName = encodeURIComponent(receipt.originalName);
  return new Response(blob.stream, {
    status: 200,
    headers: {
      "Content-Type": receipt.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${safeName}`,
      // No caching — receipts are personal data and the next request
      // might be from a different session.
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * Attendee delete. Only allowed when `phase.allowChangeAfterSubmit`.
 * The service throws ReceiptDeleteNotAllowedError otherwise; we map
 * that to 409 since it's a state conflict, not an auth failure.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { eventSlug, receiptId } = await params;

  const session = await getPortalSessionFromRequest(req, eventSlug);
  if (!session) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const registration = await prisma.registration.findFirst({
    where: { id: session.registrationId, eventId: event.id },
    select: { id: true },
  });
  if (!registration) {
    return NextResponse.json(
      { error: "Session is no longer valid" },
      { status: 401 }
    );
  }

  try {
    await deleteReceiptForAttendee(receiptId, registration.id);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof ReceiptNotFoundError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 404 }
      );
    }
    if (e instanceof ReceiptDeleteNotAllowedError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 409 }
      );
    }
    console.error("[receipt delete] unexpected:", e);
    return NextResponse.json(
      { error: "Delete failed. Please try again." },
      { status: 500 }
    );
  }
}
