import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent, apiError } from "@/lib/api-auth";
import {
  deleteStep,
  reorderStep,
  updateStep,
} from "@/lib/services/phase.service";
import {
  reorderStepSchema,
  updateStepSchema,
} from "@/lib/validations/phase";

async function requireStepOnPhaseAndEvent(
  eventId: string,
  phaseId: string,
  stepId: string
) {
  const step = await prisma.step.findUnique({
    where: { id: stepId },
    select: {
      phaseId: true,
      phase: { select: { eventId: true } },
    },
  });
  if (!step) return null;
  if (step.phaseId !== phaseId) return null;
  if (step.phase.eventId !== eventId) return null;
  return step;
}

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ eventId: string; phaseId: string; stepId: string }>;
  }
) {
  const { eventId, phaseId, stepId } = await params;
  const auth = await authorizeEvent(eventId, { role: "editor" });
  if (auth instanceof NextResponse) return auth;

  if (!(await requireStepOnPhaseAndEvent(eventId, phaseId, stepId))) {
    return apiError("Step not found on this phase", 404);
  }

  const body = await req.json();

  if (body && typeof body === "object" && "direction" in body) {
    const parsed = reorderStepSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(JSON.stringify(parsed.error.flatten()), 400);
    }
    await reorderStep(phaseId, stepId, parsed.data.direction);
    return NextResponse.json({ success: true });
  }

  const parsed = updateStepSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(JSON.stringify(parsed.error.flatten()), 400);
  }
  const updated = await updateStep(stepId, parsed.data);
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ eventId: string; phaseId: string; stepId: string }>;
  }
) {
  const { eventId, phaseId, stepId } = await params;
  const auth = await authorizeEvent(eventId, { role: "editor" });
  if (auth instanceof NextResponse) return auth;

  if (!(await requireStepOnPhaseAndEvent(eventId, phaseId, stepId))) {
    return apiError("Step not found on this phase", 404);
  }

  try {
    await deleteStep(stepId);
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError((e as Error).message, 400);
  }
}
