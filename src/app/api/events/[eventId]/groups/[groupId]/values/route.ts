import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { groupValueCreateSchema } from "@/lib/validations/attendee-group";

interface RouteParams {
  params: Promise<{ eventId: string; groupId: string }>;
}

// POST — add a value to a group ("Gold", "Silver", …).
export async function POST(req: Request, { params }: RouteParams) {
  const { eventId, groupId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

  // Group must belong to this event.
  const group = await prisma.attendeeGroup.findFirst({
    where: { id: groupId, eventId },
    select: { id: true },
  });
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = groupValueCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const order = await prisma.attendeeGroupValue.count({ where: { groupId } });
    const value = await prisma.attendeeGroupValue.create({
      data: {
        groupId,
        label: parsed.data.label,
        color: parsed.data.color ?? null,
        order,
      },
      select: { id: true, label: true, color: true, order: true },
    });
    return NextResponse.json(value, { status: 201 });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A value with this label already exists in this group" },
        { status: 409 }
      );
    }
    throw e;
  }
}
