import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "authenticated" });
  if (ctx instanceof NextResponse) return ctx;

  const searchParams = req.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") || "";
  const status = searchParams.get("status") || "";
  const badgeEmail = searchParams.get("badgeEmail") || "";
  const phaseId = searchParams.get("phase") || "";
  const phaseStatus = searchParams.get("phaseStatus") || ""; // submitted | notSubmitted
  // Stage 5: filter by a specific option pick. Combines with `phase`
  // — "phase=X&option=Y" means "attendees who picked Y on phase X".
  const optionId = searchParams.get("option") || "";

  const where: Record<string, unknown> = { eventId };
  const andConditions: Record<string, unknown>[] = [];

  if (search) {
    andConditions.push({
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { organization: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  if (category) {
    where.category = category;
  }

  if (status) {
    where.status = status;
  }

  if (badgeEmail === "sent") {
    where.registration = { badgeEmailSent: true };
  } else if (badgeEmail === "not_sent") {
    andConditions.push({
      OR: [
        { registration: null },
        { registration: { badgeEmailSent: false } },
      ],
    });
  }

  // Phase status filter: only meaningful for attendees who have a
  // registration (a Contact without one can't submit a phase). For
  // "submitted" we require a matching PhaseSubmission row; for
  // "notSubmitted" we require either no registration or a registration
  // with no submission for that phase yet.
  if (phaseId && phaseStatus === "submitted") {
    andConditions.push({
      registration: {
        is: { phaseSubmissions: { some: { phaseId } } },
      },
    });
  } else if (phaseId && phaseStatus === "notSubmitted") {
    andConditions.push({
      registration: {
        is: { phaseSubmissions: { none: { phaseId } } },
      },
    });
  }

  // Stage 5 option filter — independent of phase-status above. Filters
  // to contacts whose registration has a selection on (phaseId, optionId).
  if (phaseId && optionId) {
    andConditions.push({
      registration: {
        is: {
          selections: { some: { phaseId, optionId } },
        },
      },
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  try {
    // Batch all queries in a single transaction to minimize connection usage
    const [event, contacts, allContacts, templates, postRegPhases] = await prisma.$transaction([
      prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, name: true, slug: true, categories: true },
      }),
      prisma.contact.findMany({
        where,
        include: {
          registration: { select: { status: true, registeredAt: true, confirmationCode: true, badgeEmailSent: true } },
          emailLogs: { select: { id: true, status: true, sentAt: true }, orderBy: { sentAt: "desc" }, take: 1 },
        },
        orderBy: [{ category: "asc" }, { createdAt: "desc" }],
      }),
      // Unfiltered contacts for overall stats bar
      prisma.contact.findMany({
        where: { eventId },
        select: { status: true },
      }),
      prisma.emailTemplate.findMany({
        where: { eventId },
        select: { id: true, name: true, type: true, subject: true },
        orderBy: { createdAt: "desc" },
      }),
      // Post-registration phases — feeds the "Phase status" filter
      // dropdown AND the Stage-5 option-filter chip (we include the
      // option list per phase so the chip can resolve its label
      // without a second fetch).
      prisma.phase.findMany({
        where: { eventId, type: "POST_REGISTRATION", isActive: true },
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          options: {
            select: { id: true, label: true },
            orderBy: { order: "asc" },
          },
        },
      }),
    ]);

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Group by category
    const groups: Record<string, typeof contacts> = {};
    for (const contact of contacts) {
      const key = contact.category || "Uncategorized";
      if (!groups[key]) groups[key] = [];
      groups[key].push(contact);
    }

    // Count statuses from filtered results
    const statusCounts = { IMPORTED: 0, INVITED: 0, REGISTERED: 0, CANCELLED: 0 };
    for (const contact of contacts) {
      statusCounts[contact.status]++;
    }

    // Overall counts (unfiltered) for the stats bar
    const overallCounts = { IMPORTED: 0, INVITED: 0, REGISTERED: 0, CANCELLED: 0 };
    for (const contact of allContacts) {
      overallCounts[contact.status]++;
    }

    return NextResponse.json({
      event,
      templates,
      groups: Object.entries(groups).map(([cat, items]) => ({
        category: cat,
        count: items.length,
        contacts: items,
      })),
      statusCounts,
      total: contacts.length,
      overallCounts,
      overallTotal: allContacts.length,
      postRegPhases,
    });
  } catch (e) {
    console.error("Failed to fetch attendees data:", e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
