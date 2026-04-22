import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent, apiError } from "@/lib/api-auth";
import { eventMemberService } from "@/lib/services/event-member.service";
import { eventMemberUpsertSchema } from "@/lib/validations/event-member";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const authResult = await authorizeEvent(eventId, { role: "manager" });
  if (authResult instanceof NextResponse) return authResult;

  const members = await eventMemberService.listForEvent(eventId);
  return NextResponse.json(members);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const authResult = await authorizeEvent(eventId, { role: "manager" });
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json();
  const parsed = eventMemberUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(JSON.stringify(parsed.error.flatten()), 400);
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: { id: true, role: true },
  });
  if (!user) {
    return apiError(
      "No user with that email. Ask an administrator to create the account first.",
      404
    );
  }
  if (user.role === "SUPER_ADMIN") {
    return apiError(
      "Super admins already have access to every event — no need to assign.",
      400
    );
  }

  const member = await eventMemberService.upsert(
    eventId,
    user.id,
    parsed.data.role
  );
  return NextResponse.json(member, { status: 201 });
}
