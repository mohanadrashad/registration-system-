import { NextRequest, NextResponse } from "next/server";
import { authorize, apiError } from "@/lib/api-auth";
import { eventMemberService } from "@/lib/services/event-member.service";
import { eventMemberAssignmentsSchema } from "@/lib/validations/event-member";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authResult = await authorize("super_admin");
  if (authResult instanceof NextResponse) return authResult;

  const { userId } = await params;
  const memberships = await eventMemberService.listForUser(userId);
  return NextResponse.json(memberships);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authResult = await authorize("super_admin");
  if (authResult instanceof NextResponse) return authResult;

  const { userId } = await params;
  const body = await req.json();
  const parsed = eventMemberAssignmentsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(JSON.stringify(parsed.error.flatten()), 400);
  }

  await eventMemberService.replaceForUser(userId, parsed.data.assignments);
  const memberships = await eventMemberService.listForUser(userId);
  return NextResponse.json(memberships);
}
