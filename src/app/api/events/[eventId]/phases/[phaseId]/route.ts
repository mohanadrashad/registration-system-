import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent, apiError } from "@/lib/api-auth";
import {
  deletePhase,
  reorderPhase,
  updatePhase,
} from "@/lib/services/phase.service";
import {
  reorderPhaseSchema,
  updatePhaseSchema,
} from "@/lib/validations/phase";
import { SelectionModeNotAllowedError } from "@/lib/validations/selection";
import { requireModule } from "@/lib/guards/module-guard";

// Selection-related fields on the phase patch are gated by the postRegPhases
// module — same flag the rest of post-reg phases run under. We don't gate the
// whole route because the existing fields (title, description, dates, …) are
// always editable on any phase the user already has access to.
const SELECTION_FIELDS = [
  "selectionMode",
  "maxSelections",
  "allowChangeAfterSubmit",
  "requiresReceiptUpload",
] as const;

function patchTouchesSelectionFields(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return SELECTION_FIELDS.some((k) => k in (body as Record<string, unknown>));
}

async function requirePhaseOnEvent(eventId: string, phaseId: string) {
  const phase = await prisma.phase.findUnique({
    where: { id: phaseId },
    select: { eventId: true, type: true },
  });
  if (!phase) return null;
  if (phase.eventId !== eventId) return null;
  return phase;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; phaseId: string }> }
) {
  const { eventId, phaseId } = await params;
  const auth = await authorizeEvent(eventId, { role: "editor" });
  if (auth instanceof NextResponse) return auth;

  const phase = await requirePhaseOnEvent(eventId, phaseId);
  if (!phase) return apiError("Phase not found on this event", 404);

  const body = await req.json();

  // Reorder is a separate operation under the same endpoint to keep the
  // route surface small. Body shape: { direction: "up" | "down" }.
  if (body && typeof body === "object" && "direction" in body) {
    const parsed = reorderPhaseSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(JSON.stringify(parsed.error.flatten()), 400);
    }
    try {
      await reorderPhase(eventId, phaseId, parsed.data.direction);
      return NextResponse.json({ success: true });
    } catch (e) {
      return apiError((e as Error).message, 400);
    }
  }

  const parsed = updatePhaseSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(JSON.stringify(parsed.error.flatten()), 400);
  }

  // Gate Stage 2 selection-field writes on the postRegPhases module.
  if (patchTouchesSelectionFields(parsed.data)) {
    const moduleErr = await requireModule(eventId, "postRegPhases");
    if (moduleErr) return moduleErr;
  }

  try {
    const updated = await updatePhase(phaseId, {
      ...parsed.data,
      opensAt:
        parsed.data.opensAt === undefined
          ? undefined
          : parsed.data.opensAt
          ? new Date(parsed.data.opensAt)
          : null,
      closesAt:
        parsed.data.closesAt === undefined
          ? undefined
          : parsed.data.closesAt
          ? new Date(parsed.data.closesAt)
          : null,
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof SelectionModeNotAllowedError) {
      return apiError(e.message, 400, e.code);
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string; phaseId: string }> }
) {
  const { eventId, phaseId } = await params;
  const auth = await authorizeEvent(eventId, { role: "manager" });
  if (auth instanceof NextResponse) return auth;

  const phase = await requirePhaseOnEvent(eventId, phaseId);
  if (!phase) return apiError("Phase not found on this event", 404);

  try {
    await deletePhase(phaseId);
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError((e as Error).message, 400);
  }
}
