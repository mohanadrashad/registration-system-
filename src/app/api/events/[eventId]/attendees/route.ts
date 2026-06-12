import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import {
  getFilterableFields,
  readAttendeeFilterParams,
  buildContactWhere,
} from "@/lib/attendees/attendee-filters";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "authenticated" });
  if (ctx instanceof NextResponse) return ctx;

  // Filter construction lives in src/lib/attendees/attendee-filters.ts,
  // shared with the registrations export route so the exported set always
  // matches what's on screen. filterableFields also feeds the dynamic
  // form-answer filter UI (one dropdown per option-bearing form field).
  const filterableFields = await getFilterableFields(eventId);
  const filterParams = readAttendeeFilterParams(
    req.nextUrl.searchParams,
    filterableFields
  );
  const where = buildContactWhere(eventId, filterParams, filterableFields);

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
      filterableFields,
    });
  } catch (e) {
    console.error("Failed to fetch attendees data:", e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
