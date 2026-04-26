import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent, apiError } from "@/lib/api-auth";
import { createStep } from "@/lib/services/phase.service";
import { createStepSchema } from "@/lib/validations/phase";

async function requirePhaseOnEvent(eventId: string, phaseId: string) {
  const phase = await prisma.phase.findUnique({
    where: { id: phaseId },
    select: { eventId: true },
  });
  if (!phase || phase.eventId !== eventId) return null;
  return phase;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string; phaseId: string }> }
) {
  const { eventId, phaseId } = await params;
  const auth = await authorizeEvent(eventId);
  if (auth instanceof NextResponse) return auth;

  if (!(await requirePhaseOnEvent(eventId, phaseId))) {
    return apiError("Phase not found on this event", 404);
  }

  const steps = await prisma.step.findMany({
    where: { phaseId },
    orderBy: { order: "asc" },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(steps);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; phaseId: string }> }
) {
  const { eventId, phaseId } = await params;
  const auth = await authorizeEvent(eventId, { role: "editor" });
  if (auth instanceof NextResponse) return auth;

  if (!(await requirePhaseOnEvent(eventId, phaseId))) {
    return apiError("Phase not found on this event", 404);
  }

  const parsed = createStepSchema.safeParse(await req.json());
  if (!parsed.success) {
    return apiError(JSON.stringify(parsed.error.flatten()), 400);
  }

  const step = await createStep(phaseId, parsed.data);
  return NextResponse.json(step, { status: 201 });
}
