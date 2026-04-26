import { NextRequest, NextResponse } from "next/server";
import { authorizeEvent, apiError } from "@/lib/api-auth";
import {
  createPostRegistrationPhase,
  listPhasesForEvent,
} from "@/lib/services/phase.service";
import { requireModule } from "@/lib/guards/module-guard";
import { createPhaseSchema } from "@/lib/validations/phase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const auth = await authorizeEvent(eventId);
  if (auth instanceof NextResponse) return auth;

  const phases = await listPhasesForEvent(eventId);
  return NextResponse.json(phases);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const auth = await authorizeEvent(eventId, { role: "editor" });
  if (auth instanceof NextResponse) return auth;

  // Post-registration phases require the postRegPhases module to be on.
  const moduleErr = await requireModule(eventId, "postRegPhases");
  if (moduleErr) return moduleErr;

  const parsed = createPhaseSchema.safeParse(await req.json());
  if (!parsed.success) {
    return apiError(JSON.stringify(parsed.error.flatten()), 400);
  }

  const phase = await createPostRegistrationPhase(eventId, {
    ...parsed.data,
    opensAt: parsed.data.opensAt ? new Date(parsed.data.opensAt) : null,
    closesAt: parsed.data.closesAt ? new Date(parsed.data.closesAt) : null,
  });
  return NextResponse.json(phase, { status: 201 });
}
