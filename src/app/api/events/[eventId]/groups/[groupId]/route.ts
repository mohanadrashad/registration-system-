import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { groupUpdateSchema } from "@/lib/validations/attendee-group";

interface RouteParams {
  params: Promise<{ eventId: string; groupId: string }>;
}

// PATCH — rename a group, toggle allowMultiple, or reorder.
// Note: flipping allowMultiple true→false does NOT retroactively prune
// attendees who already hold several values; single-enforcement applies
// to new assignments only (Stage 2). The settings UI surfaces this.
export async function PATCH(req: Request, { params }: RouteParams) {
  const { eventId, groupId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

  // Cross-event guard: the group must belong to this event.
  const existing = await prisma.attendeeGroup.findFirst({
    where: { id: groupId, eventId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = groupUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const group = await prisma.attendeeGroup.update({
      where: { id: groupId },
      data: parsed.data,
      include: {
        values: {
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          select: { id: true, label: true, color: true, order: true },
        },
      },
    });
    return NextResponse.json(group);
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A group with this name already exists for this event" },
        { status: 409 }
      );
    }
    throw e;
  }
}

// DELETE — remove a group and (by cascade) its values + all attendee
// assignments. Manager-gated: it discards data for every tagged attendee.
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { eventId, groupId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "manager" });
  if (ctx instanceof NextResponse) return ctx;

  // eventId in the where doubles as the cross-event guard: a group from
  // another event simply doesn't match and 404s.
  const res = await prisma.attendeeGroup.deleteMany({
    where: { id: groupId, eventId },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
