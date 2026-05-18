import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent, apiError } from "@/lib/api-auth";
import {
  AdminPhaseSelection,
  streamPhaseSelectionsForAdmin,
} from "@/lib/services/selection.service";

interface RouteParams {
  params: Promise<{ eventId: string; phaseId: string }>;
}

/**
 * Admin overview of every selection on a phase. Two response shapes
 * via the `format` query param:
 *
 *   default (JSON) — buffered list. Used by the stats page's expanded
 *   row and the attendees-list filter. Capped at the streamed batch
 *   size (500/batch) but the response itself accumulates rows; OK at
 *   typical phase sizes.
 *
 *   ?format=csv — streamed CSV. Each batch encodes to CSV lines as
 *   it's pulled from Prisma. Memory stays constant regardless of
 *   total row count.
 *
 * ?optionId= filters to a single option for "show me everyone in
 * Hotel A" workflows.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { eventId, phaseId } = await params;
  const auth = await authorizeEvent(eventId, { module: "postRegPhases" });
  if (auth instanceof NextResponse) return auth;

  // Confirm the phase is on this event before we stream anything.
  const phase = await prisma.phase.findFirst({
    where: { id: phaseId, eventId },
    select: { id: true, title: true },
  });
  if (!phase) {
    return apiError("Phase not found on this event", 404);
  }

  const url = new URL(req.url);
  const filterOptionId = url.searchParams.get("optionId") ?? undefined;
  const format = url.searchParams.get("format");

  // ── CSV streaming branch ───────────────────────────────────────
  if (format === "csv") {
    // Resolve admin user IDs → emails for the assigned_by column.
    // We do a single pre-pass to collect IDs since the stream can't
    // do per-row joins efficiently. For the typical ~5–10 admins per
    // event this is one tiny query.
    const distinctAdmins = await prisma.attendeeSelection.findMany({
      where: {
        phaseId,
        phase: { eventId },
        ...(filterOptionId && { optionId: filterOptionId }),
        assignedBy: { not: null },
      },
      distinct: ["assignedBy"],
      select: { assignedBy: true },
    });
    const adminIds = distinctAdmins
      .map((d) => d.assignedBy)
      .filter((id): id is string => !!id);
    const adminUsers =
      adminIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: adminIds } },
            select: { id: true, email: true },
          })
        : [];
    const adminEmailById = new Map(
      adminUsers.map((u) => [u.id, u.email] as const)
    );

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const header = [
          "registration_id",
          "first_name",
          "last_name",
          "email",
          "phone",
          "option_id",
          "option_label",
          "source",
          "assigned_by_email",
          "assigned_at",
          "has_receipt",
          "receipt_filename",
          "notes",
        ].join(",");
        controller.enqueue(encoder.encode("﻿" + header + "\n"));
        // Note: leading BOM (U+FEFF) helps Excel detect UTF-8 — so
        // Arabic contact names render without mojibake.

        try {
          for await (const sel of streamPhaseSelectionsForAdmin(
            phaseId,
            eventId,
            filterOptionId
          )) {
            const c = sel.registration.contact;
            const fields = [
              sel.registration.id,
              c.firstName,
              c.lastName,
              c.email,
              c.phone ?? "",
              sel.option.id,
              sel.option.label,
              sel.source,
              sel.assignedBy
                ? adminEmailById.get(sel.assignedBy) ?? ""
                : "",
              sel.assignedAt.toISOString(),
              sel.receiptFileId ? "yes" : "no",
              sel.receipt?.originalName ?? "",
              sel.notes ?? "",
            ];
            controller.enqueue(
              encoder.encode(fields.map(csvEscape).join(",") + "\n")
            );
          }
          controller.close();
        } catch (err) {
          console.error("[selections csv stream] error:", err);
          controller.error(err);
        }
      },
    });

    const filename = filterOptionId
      ? `selections-${phase.title.replace(/[^a-z0-9]+/gi, "_")}-${filterOptionId.slice(0, 6)}.csv`
      : `selections-${phase.title.replace(/[^a-z0-9]+/gi, "_")}.csv`;
    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  // ── JSON branch (for the stats expand + attendees filter) ──────
  const rows: AdminPhaseSelection[] = [];
  for await (const sel of streamPhaseSelectionsForAdmin(
    phaseId,
    eventId,
    filterOptionId
  )) {
    rows.push(sel);
  }
  return NextResponse.json({
    phaseId: phase.id,
    phaseTitle: phase.title,
    optionId: filterOptionId ?? null,
    count: rows.length,
    selections: rows.map((s) => ({
      id: s.id,
      registrationId: s.registration.id,
      contact: s.registration.contact,
      optionId: s.option.id,
      optionLabel: s.option.label,
      source: s.source,
      assignedBy: s.assignedBy,
      assignedAt: s.assignedAt,
      notes: s.notes,
      hasReceipt: !!s.receiptFileId,
      receipt: s.receipt
        ? {
            id: s.receipt.id,
            originalName: s.receipt.originalName,
            uploadedAt: s.receipt.uploadedAt,
          }
        : null,
    })),
  });
}

/**
 * RFC 4180-ish CSV field escaping. Wrap any field containing a comma,
 * quote, or newline in double quotes; double-up internal quotes.
 */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
