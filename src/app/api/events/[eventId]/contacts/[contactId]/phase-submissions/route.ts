import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";

/**
 * Returns every post-registration phase for the event, paired with this
 * attendee's submission for that phase (if any) and the field
 * definitions needed to render the typed values back as a labelled
 * read-only form. Drives the "Phase Submissions" card on the attendee
 * detail page.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; contactId: string }> }
) {
  const { eventId, contactId } = await params;
  const auth = await authorizeEvent(eventId);
  if (auth instanceof NextResponse) return auth;

  // Look up the registration this contact owns. Without one there are no
  // submissions to show; return an empty list so the UI can hide the card.
  const registration = await prisma.registration.findFirst({
    where: { eventId, contactId },
    select: { id: true, contact: { select: { category: true } } },
  });

  const phases = await prisma.phase.findMany({
    where: { eventId, type: "POST_REGISTRATION", isActive: true },
    orderBy: { order: "asc" },
    include: {
      accessOverrides: registration
        ? {
            where: { registrationId: registration.id },
            select: { status: true },
          }
        : false,
      steps: {
        orderBy: { order: "asc" },
        include: {
          fields: {
            where: { isActive: true },
            orderBy: { order: "asc" },
            select: {
              name: true,
              label: true,
              labelAr: true,
              type: true,
              options: true,
            },
          },
        },
      },
      submissions: registration
        ? {
            where: { registrationId: registration.id },
            select: { data: true, submittedAt: true, updatedAt: true },
            take: 1,
          }
        : false,
    },
  });

  // Stage 2: per-category visibility. M = every active POST_REG phase;
  // a phase is visible to this attendee iff it is unrestricted, lists
  // the attendee's category, or carries a PhaseAccess override (OPEN or
  // LOCKED) — an explicit per-attendee admin decision that wins over
  // the category filter (open Q5 default).
  const totalPostRegPhases = phases.length;
  const attendeeCategory = registration?.contact?.category ?? null;
  const visiblePhases = phases.filter((p) => {
    const override = registration
      ? (p as { accessOverrides?: { status: string }[] }).accessOverrides?.[0]
          ?.status ?? null
      : null;
    if (override === "OPEN" || override === "LOCKED") return true;
    return (
      p.appliesToCategories.length === 0 ||
      (attendeeCategory != null &&
        p.appliesToCategories.includes(attendeeCategory))
    );
  });

  const result = visiblePhases.map((p) => {
    const sub = registration && p.submissions.length > 0 ? p.submissions[0] : undefined;
    return {
      id: p.id,
      title: p.title,
      titleAr: p.titleAr,
      status: sub ? "SUBMITTED" : "NOT_SUBMITTED",
      submittedAt: sub?.submittedAt ?? null,
      updatedAt: sub?.updatedAt ?? null,
      steps: p.steps.map((s) => ({
        id: s.id,
        title: s.title,
        fields: s.fields,
      })),
      data: (sub?.data as Record<string, unknown> | undefined) ?? null,
    };
  });

  return NextResponse.json({ phases: result, totalPostRegPhases });
}
