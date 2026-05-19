import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent, apiError } from "@/lib/api-auth";
import {
  clearPhaseAccess,
  listPhaseAccessForRegistration,
  setPhaseAccess,
} from "@/lib/services/phase.service";
import { setPhaseAccessSchema } from "@/lib/validations/phase";

// Look up the registration for this (event, contact) pair. The override
// is keyed by registration, but the dashboard navigates by contact, so
// we resolve it here and reject if there's no registration to override.
async function resolveRegistration(
  eventId: string,
  contactId: string
): Promise<{ id: string; category: string | null } | null> {
  const reg = await prisma.registration.findFirst({
    where: { eventId, contactId },
    select: { id: true, contact: { select: { category: true } } },
  });
  if (!reg) return null;
  return { id: reg.id, category: reg.contact.category };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string; contactId: string }> }
) {
  const { eventId, contactId } = await params;
  const auth = await authorizeEvent(eventId);
  if (auth instanceof NextResponse) return auth;

  const registration = await resolveRegistration(eventId, contactId);
  if (!registration) {
    // No registration yet → no phases to override. Return an empty list
    // rather than 404 so the UI can render "no phases" state cleanly.
    return NextResponse.json({ phases: [] });
  }

  const phases = await listPhaseAccessForRegistration(
    eventId,
    registration.id,
    registration.category
  );
  return NextResponse.json({ phases });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; contactId: string }> }
) {
  const { eventId, contactId } = await params;
  const auth = await authorizeEvent(eventId, { role: "editor" });
  if (auth instanceof NextResponse) return auth;

  const registration = await resolveRegistration(eventId, contactId);
  if (!registration) {
    return apiError("Attendee has no registration to override.", 400);
  }
  const registrationId = registration.id;

  const body = await req.json();
  const parsed = setPhaseAccessSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(JSON.stringify(parsed.error.flatten()), 400);
  }

  // Phase must belong to this event AND be a post-registration phase.
  // Overriding the REGISTRATION phase is not meaningful — registration
  // is gated by capacity / approval, not by PhaseAccess.
  const phase = await prisma.phase.findUnique({
    where: { id: parsed.data.phaseId },
    select: { eventId: true, type: true },
  });
  if (!phase || phase.eventId !== eventId) {
    return apiError("Phase not found on this event", 404);
  }
  if (phase.type !== "POST_REGISTRATION") {
    return apiError(
      "Per-attendee overrides only apply to post-registration phases.",
      400
    );
  }

  if (parsed.data.status === null) {
    await clearPhaseAccess(parsed.data.phaseId, registrationId);
  } else {
    await setPhaseAccess(
      parsed.data.phaseId,
      registrationId,
      parsed.data.status,
      parsed.data.reason ?? null,
      auth.session.user.id
    );
  }

  const phases = await listPhaseAccessForRegistration(
    eventId,
    registrationId,
    registration.category
  );
  return NextResponse.json({ phases });
}
