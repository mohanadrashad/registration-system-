import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent, apiError } from "@/lib/api-auth";
import { moveFieldToStep } from "@/lib/services/phase.service";
import { moveFieldSchema } from "@/lib/validations/phase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; fieldId: string }> }
) {
  const { eventId, fieldId } = await params;
  const auth = await authorizeEvent(eventId, { role: "editor" });
  if (auth instanceof NextResponse) return auth;

  // Confirm the field belongs to this event before doing anything else.
  const field = await prisma.formField.findUnique({
    where: { id: fieldId },
    select: { eventId: true },
  });
  if (!field || field.eventId !== eventId) {
    return apiError("Field not found on this event", 404);
  }

  const parsed = moveFieldSchema.safeParse(await req.json());
  if (!parsed.success) {
    return apiError(JSON.stringify(parsed.error.flatten()), 400);
  }

  try {
    await moveFieldToStep(fieldId, parsed.data.stepId);
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiError((e as Error).message, 400);
  }
}
