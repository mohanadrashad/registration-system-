import { NextRequest, NextResponse } from "next/server";
import { ContactStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import {
  getFilterableFields,
  readAttendeeFilterParams,
  buildContactWhere,
} from "@/lib/attendees/attendee-filters";

function toStatusCounts(
  groups: Array<{
    status: ContactStatus;
    // Prisma's groupBy payload types _count as a wide union; only the
    // `{ _all }` object shape actually occurs with `_count: { _all: true }`.
    _count: { _all?: number | null } | true | null | undefined;
  }>
): Record<ContactStatus, number> {
  const counts: Record<ContactStatus, number> = {
    IMPORTED: 0,
    INVITED: 0,
    REGISTERED: 0,
    CANCELLED: 0,
  };
  for (const g of groups) {
    counts[g.status] =
      g._count && g._count !== true ? g._count._all ?? 0 : 0;
  }
  return counts;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "authenticated" });
  if (ctx instanceof NextResponse) return ctx;

  const searchParams = req.nextUrl.searchParams;

  // Server-side pagination: events carry thousands of contacts (7k+),
  // so the client requests one slice and the DB does the counting —
  // never ship the full list in one response.
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10) || 25)
  );
  const sort = searchParams.get("sort") || ""; // "" | emailed_yes | emailed_no
  // idsOnly powers "Select all N attendees": bulk email/delete take
  // explicit id lists, so the client fetches just the matching ids.
  const idsOnly = searchParams.get("idsOnly") === "1";
  // Meta (event, templates, post-reg phases) is stable across filter
  // changes — the client requests it once on first load, not per fetch.
  const includeMeta = searchParams.get("includeMeta") === "1";

  // Filter construction lives in src/lib/attendees/attendee-filters.ts,
  // shared with the registrations export route so the exported set always
  // matches what's on screen. filterableFields also feeds the dynamic
  // form-answer filter UI (one dropdown per option-bearing form field).
  const filterableFields = await getFilterableFields(eventId);
  const filterParams = readAttendeeFilterParams(searchParams, filterableFields);
  const where = buildContactWhere(
    eventId,
    filterParams,
    filterableFields
  ) as Prisma.ContactWhereInput;

  try {
    if (idsOnly) {
      const rows = await prisma.contact.findMany({
        where,
        select: { id: true },
      });
      return NextResponse.json({
        ids: rows.map((r) => r.id),
        total: rows.length,
      });
    }

    // "Emailed" column sort is approximated by email-log count: any log
    // means "sent". Default keeps the long-standing category → newest
    // ordering so pages show contiguous category blocks.
    const orderBy: Prisma.ContactOrderByWithRelationInput[] =
      sort === "emailed_yes"
        ? [{ emailLogs: { _count: "desc" } }, { createdAt: "desc" }]
        : sort === "emailed_no"
        ? [{ emailLogs: { _count: "asc" } }, { createdAt: "desc" }]
        : [{ category: "asc" }, { createdAt: "desc" }];

    const [contacts, total, filteredGroups, overallGroups] =
      await prisma.$transaction([
        prisma.contact.findMany({
          where,
          include: {
            registration: {
              select: {
                status: true,
                registeredAt: true,
                confirmationCode: true,
                badgeEmailSent: true,
              },
            },
            emailLogs: {
              select: { id: true, status: true, sentAt: true },
              orderBy: { sentAt: "desc" },
              take: 1,
            },
          },
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.contact.count({ where }),
        prisma.contact.groupBy({
          by: ["status"],
          where,
          orderBy: { status: "asc" },
          _count: { _all: true },
        }),
        prisma.contact.groupBy({
          by: ["status"],
          where: { eventId },
          orderBy: { status: "asc" },
          _count: { _all: true },
        }),
      ]);

    const overallCounts = toStatusCounts(overallGroups);
    const overallTotal = Object.values(overallCounts).reduce((s, n) => s + n, 0);

    const response: Record<string, unknown> = {
      contacts,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      statusCounts: toStatusCounts(filteredGroups),
      overallCounts,
      overallTotal,
      filterableFields,
    };

    if (includeMeta) {
      const [event, templates, postRegPhases] = await prisma.$transaction([
        prisma.event.findUnique({
          where: { id: eventId },
          select: { id: true, name: true, slug: true, categories: true },
        }),
        prisma.emailTemplate.findMany({
          where: { eventId },
          select: { id: true, name: true, type: true, subject: true },
          orderBy: { createdAt: "desc" },
        }),
        // Post-registration phases — feeds the "Phase status" filter
        // dropdown AND the option-filter chip (option list included so
        // the chip resolves its label without a second fetch).
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
      response.event = event;
      response.templates = templates;
      response.postRegPhases = postRegPhases;
    }

    return NextResponse.json(response);
  } catch (e) {
    console.error("Failed to fetch attendees data:", e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
