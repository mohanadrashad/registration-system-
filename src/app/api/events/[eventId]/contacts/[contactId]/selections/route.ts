import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizeEvent, apiError } from "@/lib/api-auth";
import {
  AdminWriteCapacityError,
  adminWriteSelectionsWithCleanup,
  listAttendeeSelectionsForAdmin,
  OptionInactiveError,
  OptionsCrossPhaseError,
  PhaseNotFoundForSelectionError,
  SelectionDuplicateError,
  SelectionModeNotWritableError,
  TooManySelectionsError,
} from "@/lib/services/selection.service";

interface RouteParams {
  params: Promise<{ eventId: string; contactId: string }>;
}

const writeBodySchema = z.object({
  phaseId: z.string().min(1),
  optionIds: z.array(z.string().min(1)).max(50),
  notes: z.union([z.string().max(2000), z.null()]).optional(),
  force: z.boolean().optional(),
});

/**
 * Lookup the registration for the contactId on the event. Both must
 * resolve and align — otherwise 404 to avoid leaking which contacts
 * exist in other events.
 */
async function resolveRegistration(eventId: string, contactId: string) {
  const reg = await prisma.registration.findFirst({
    where: { contactId, eventId },
    select: { id: true },
  });
  return reg;
}

// GET — list this attendee's selections across all option-bearing phases.
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { eventId, contactId } = await params;
  const auth = await authorizeEvent(eventId, { module: "postRegPhases" });
  if (auth instanceof NextResponse) return auth;

  const reg = await resolveRegistration(eventId, contactId);
  if (!reg) {
    return apiError("Attendee not found on this event", 404);
  }

  const phases = await listAttendeeSelectionsForAdmin(eventId, reg.id);
  return NextResponse.json({ registrationId: reg.id, phases });
}

// PUT — admin write. Body: { phaseId, optionIds[], notes?, force? }.
// Replaces this attendee's selections on the named phase.
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { eventId, contactId } = await params;
  const auth = await authorizeEvent(eventId, {
    role: "editor",
    module: "postRegPhases",
  });
  if (auth instanceof NextResponse) return auth;

  const reg = await resolveRegistration(eventId, contactId);
  if (!reg) {
    return apiError("Attendee not found on this event", 404);
  }

  const parsed = writeBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { phaseId, optionIds, notes, force } = parsed.data;

  try {
    const result = await adminWriteSelectionsWithCleanup({
      eventId,
      phaseId,
      registrationId: reg.id,
      optionIds,
      notes: notes ?? null,
      adminUserId: auth.session.user.id,
      force: !!force,
    });
    return NextResponse.json({
      success: true,
      selections: result.selections.map((s) => ({
        id: s.id,
        optionId: s.optionId,
        source: s.source,
        assignedAt: s.assignedAt,
        assignedBy: s.assignedBy,
        notes: s.notes,
      })),
      options: result.options,
      overCapacity: result.overCapacity,
      blobsDeleted: result.blobsDeleted,
    });
  } catch (e) {
    if (e instanceof AdminWriteCapacityError) {
      return NextResponse.json(
        {
          error: e.message,
          code: e.code,
          optionId: e.optionId,
          taken: e.taken,
          capacity: e.capacity,
        },
        { status: 409 }
      );
    }
    if (e instanceof OptionsCrossPhaseError) {
      return apiError(e.message, 400, e.code);
    }
    if (e instanceof OptionInactiveError) {
      return apiError(e.message, 400, e.code);
    }
    if (e instanceof TooManySelectionsError) {
      return apiError(e.message, 400, e.code);
    }
    if (e instanceof SelectionDuplicateError) {
      return apiError(e.message, 400, e.code);
    }
    if (e instanceof SelectionModeNotWritableError) {
      return apiError(e.message, 400, e.code);
    }
    if (e instanceof PhaseNotFoundForSelectionError) {
      return apiError(e.message, 404, e.code);
    }
    console.error("[admin write selections] unexpected:", e);
    return apiError("Write failed. Please try again.", 500);
  }
}
