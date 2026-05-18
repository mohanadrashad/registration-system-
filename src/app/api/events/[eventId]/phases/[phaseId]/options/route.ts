import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent, apiError } from "@/lib/api-auth";
import {
  createOption,
  listOptionsForPhase,
} from "@/lib/services/selection.service";
import { createOptionSchema } from "@/lib/validations/selection";

async function requirePostRegPhaseOnEvent(eventId: string, phaseId: string) {
  const phase = await prisma.phase.findUnique({
    where: { id: phaseId },
    select: { eventId: true, type: true },
  });
  if (!phase || phase.eventId !== eventId) return null;
  return phase;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string; phaseId: string }> }
) {
  const { eventId, phaseId } = await params;
  const auth = await authorizeEvent(eventId, { module: "postRegPhases" });
  if (auth instanceof NextResponse) return auth;

  const phase = await requirePostRegPhaseOnEvent(eventId, phaseId);
  if (!phase) return apiError("Phase not found on this event", 404);

  const options = await listOptionsForPhase(phaseId);
  return NextResponse.json(options);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; phaseId: string }> }
) {
  const { eventId, phaseId } = await params;
  const auth = await authorizeEvent(eventId, {
    role: "editor",
    module: "postRegPhases",
  });
  if (auth instanceof NextResponse) return auth;

  const phase = await requirePostRegPhaseOnEvent(eventId, phaseId);
  if (!phase) return apiError("Phase not found on this event", 404);
  if (phase.type === "REGISTRATION") {
    return apiError(
      "Selectable options are only available on post-registration phases.",
      400,
      "SELECTION_MODE_NOT_ALLOWED_ON_REGISTRATION_PHASE"
    );
  }

  const parsed = createOptionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return apiError(JSON.stringify(parsed.error.flatten()), 400);
  }

  const option = await createOption(phaseId, parsed.data);
  return NextResponse.json(option, { status: 201 });
}
