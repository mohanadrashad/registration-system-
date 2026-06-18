import { NextRequest, NextResponse } from "next/server";
import { ContactStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import {
  getFilterableFields,
  readAttendeeFilterParams,
  buildContactWhere,
} from "@/lib/attendees/attendee-filters";
import {
  formatFormFieldValue,
  isDynamicFormField,
  FORM_COLUMN_SKIP_TYPES,
} from "@/lib/form-builder/format-form-value";

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
    // means "sent". Default orders by registration date descending so the
    // newest sign-ups stay on top; the "Registered" header toggles to
    // "registered_asc" (oldest first). We sort by the same `registeredAt` the
    // "Registered" column renders (not Contact.createdAt), so imported/
    // invited contacts who register later never appear out of order, and
    // the dates stay monotonic across every page; createdAt breaks ties.
    // Contacts that never registered (null registeredAt) sort last.
    const orderBy: Prisma.ContactOrderByWithRelationInput[] =
      sort === "emailed_yes"
        ? [{ emailLogs: { _count: "desc" } }, { createdAt: "desc" }]
        : sort === "emailed_no"
        ? [{ emailLogs: { _count: "asc" } }, { createdAt: "desc" }]
        : sort === "registered_asc"
        ? [
            { registration: { registeredAt: { sort: "asc", nulls: "last" } } },
            { createdAt: "asc" },
          ]
        : [
            { registration: { registeredAt: { sort: "desc", nulls: "last" } } },
            { createdAt: "desc" },
          ];

    const [
      contacts,
      total,
      filteredGroups,
      overallGroups,
      regFormFields,
      eventGroups,
      postRegFields,
    ] =
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
                // Raw answers — formatted into display strings below and
                // NOT forwarded to the client (kept off the wire).
                formData: true,
                // Post-registration phase answers (one row per phase),
                // also folded into display strings below.
                phaseSubmissions: {
                  select: { phaseId: true, data: true },
                },
              },
            },
            emailLogs: {
              select: { id: true, status: true, sentAt: true },
              orderBy: { sentAt: "desc" },
              take: 1,
            },
            // Attendee Group assignments — folded into per-group display
            // strings below (raw rows not forwarded to the client).
            groupAssignments: {
              select: { groupId: true, value: { select: { label: true } } },
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
        // REGISTRATION-phase form fields — the source of optional answer
        // columns. Ordered by form position so the column order in the
        // picker matches the form's layout. Fetched every request (cheap)
        // because answers are formatted per row below.
        prisma.formField.findMany({
          where: {
            eventId,
            isActive: true,
            step: { phase: { type: "REGISTRATION" } },
          },
          orderBy: { order: "asc" },
          select: { name: true, label: true, type: true, options: true },
        }),
        // Custom Attendee Groups — one optional column each, ordered like
        // the management screen (matches the export's group columns).
        prisma.attendeeGroup.findMany({
          where: { eventId },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          select: { id: true, name: true },
        }),
        // POST_REGISTRATION-phase form fields — optional answer columns,
        // sourced from PhaseSubmission.data. Carry phase + step + field
        // order so the picker order follows the phases' layout.
        prisma.formField.findMany({
          where: {
            eventId,
            isActive: true,
            step: { phase: { type: "POST_REGISTRATION", isActive: true } },
          },
          orderBy: { order: "asc" },
          select: {
            name: true,
            label: true,
            type: true,
            options: true,
            order: true,
            step: {
              select: {
                order: true,
                phase: { select: { id: true, title: true, order: true } },
              },
            },
          },
        }),
      ]);

    // Fields that warrant an answer column (skip layout-only types and
    // fields already shown as their own Contact column).
    const formColumnFields = regFormFields.filter((f) => isDynamicFormField(f));

    // Post-registration answer columns: non-layout fields across all active
    // POST_REGISTRATION phases, ordered by phase → step → field so the picker
    // follows the portal layout. The column key carries the phase id so the
    // right PhaseSubmission is read; labels are prefixed with the phase title
    // when more than one phase contributes columns (to disambiguate).
    const postRegCols = postRegFields
      .filter((f) => !FORM_COLUMN_SKIP_TYPES.has(f.type))
      .sort(
        (a, b) =>
          a.step.phase.order - b.step.phase.order ||
          a.step.order - b.step.order ||
          a.order - b.order
      );
    const multiPhase =
      new Set(postRegCols.map((f) => f.step.phase.id)).size > 1;
    const phaseColumnKey = (phaseId: string, name: string) =>
      `phase:${phaseId}:${name}`;

    // Replace each contact's raw registration (incl. formData) with a lean
    // shape plus pre-formatted `formValues` keyed by field name. Only
    // non-empty answers are emitted to keep the payload small.
    const contactsOut = contacts.map((c) => {
      const { registration: reg, groupAssignments, ...rest } = c;

      const formValues: Record<string, string> = {};
      if (reg?.formData && formColumnFields.length > 0) {
        const fd = reg.formData as Record<string, unknown>;
        for (const f of formColumnFields) {
          const display = formatFormFieldValue(f, fd[f.name]);
          if (display) formValues[f.name] = display;
        }
      }

      // One display string per group: the attendee's value label(s) joined
      // (matches the export's group columns).
      const groupValues: Record<string, string> = {};
      if (groupAssignments.length > 0 && eventGroups.length > 0) {
        const byGroup = new Map<string, string[]>();
        for (const a of groupAssignments) {
          const list = byGroup.get(a.groupId) ?? [];
          list.push(a.value.label);
          byGroup.set(a.groupId, list);
        }
        for (const [groupId, labels] of byGroup) {
          if (labels.length) groupValues[groupId] = labels.join(", ");
        }
      }

      // Post-registration answers, keyed by the full column key so the
      // client reads them directly (no parsing). Looks each field up in the
      // submission for its own phase.
      const phaseValues: Record<string, string> = {};
      if (reg?.phaseSubmissions?.length && postRegCols.length > 0) {
        const dataByPhase = new Map<string, Record<string, unknown>>();
        for (const s of reg.phaseSubmissions) {
          dataByPhase.set(s.phaseId, (s.data as Record<string, unknown>) ?? {});
        }
        for (const f of postRegCols) {
          const d = dataByPhase.get(f.step.phase.id);
          if (!d) continue;
          const display = formatFormFieldValue(f, d[f.name]);
          if (display) phaseValues[phaseColumnKey(f.step.phase.id, f.name)] = display;
        }
      }

      return {
        ...rest,
        registration: reg
          ? {
              status: reg.status,
              registeredAt: reg.registeredAt,
              confirmationCode: reg.confirmationCode,
              badgeEmailSent: reg.badgeEmailSent,
            }
          : null,
        formValues,
        groupValues,
        phaseValues,
      };
    });

    const overallCounts = toStatusCounts(overallGroups);
    const overallTotal = Object.values(overallCounts).reduce((s, n) => s + n, 0);

    const response: Record<string, unknown> = {
      contacts: contactsOut,
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
      // Optional answer columns for the column picker (name + display label,
      // in form order). Sent once with meta; values ride on each contact's
      // `formValues`.
      response.formColumns = formColumnFields.map((f) => ({
        name: f.name,
        label: f.label,
      }));
      // Custom Attendee Group columns (id + name) for the picker; values
      // ride on each contact's `groupValues`.
      response.groupColumns = eventGroups.map((g) => ({
        id: g.id,
        name: g.name,
      }));
      // Post-registration answer columns (pre-built key + label); values
      // ride on each contact's `phaseValues` under the same key.
      response.phaseColumns = postRegCols.map((f) => ({
        key: phaseColumnKey(f.step.phase.id, f.name),
        label: multiPhase ? `${f.step.phase.title}: ${f.label}` : f.label,
      }));
    }

    return NextResponse.json(response);
  } catch (e) {
    console.error("Failed to fetch attendees data:", e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
