import { NextRequest, NextResponse } from "next/server";
import { authorizeEvent, apiError } from "@/lib/api-auth";
import { eventMemberService } from "@/lib/services/event-member.service";
import { eventMemberRoleSchema } from "@/lib/validations/event-member";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string; userId: string }> }
) {
  const { eventId, userId } = await params;
  const authResult = await authorizeEvent(eventId, { role: "manager" });
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json();
  const parsed = eventMemberRoleSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(JSON.stringify(parsed.error.flatten()), 400);
  }

  const member = await eventMemberService.updateRole(
    eventId,
    userId,
    parsed.data.role
  );
  return NextResponse.json(member);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string; userId: string }> }
) {
  const { eventId, userId } = await params;
  const authResult = await authorizeEvent(eventId, { role: "manager" });
  if (authResult instanceof NextResponse) return authResult;

  // Prevent removing yourself from your own event (would lock you out mid-session).
  if (authResult.session.user.id === userId && authResult.role !== "SUPER_ADMIN") {
    return apiError("You cannot remove yourself from this event", 400);
  }

  await eventMemberService.remove(eventId, userId);
  return NextResponse.json({ success: true });
}
