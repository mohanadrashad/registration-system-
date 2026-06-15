import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { groupValueUpdateSchema } from "@/lib/validations/attendee-group";

interface RouteParams {
  params: Promise<{ eventId: string; groupId: string; valueId: string }>;
}

// Confirm the value belongs to this group AND this group to this event —
// the full chain, so a value id from another event/group can't be touched.
async function valueInScope(
  eventId: string,
  groupId: string,
  valueId: string
): Promise<boolean> {
  const value = await prisma.attendeeGroupValue.findFirst({
    where: { id: valueId, groupId, group: { eventId } },
    select: { id: true },
  });
  return value !== null;
}

// PATCH — rename / recolor / reorder a value.
export async function PATCH(req: Request, { params }: RouteParams) {
  const { eventId, groupId, valueId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

  if (!(await valueInScope(eventId, groupId, valueId))) {
    return NextResponse.json({ error: "Value not found" }, { status: 404 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = groupValueUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const data: Prisma.AttendeeGroupValueUpdateInput = {};
  if (parsed.data.label !== undefined) data.label = parsed.data.label;
  if (parsed.data.color !== undefined) data.color = parsed.data.color ?? null;
  if (parsed.data.order !== undefined) data.order = parsed.data.order;

  try {
    const value = await prisma.attendeeGroupValue.update({
      where: { id: valueId },
      data,
      select: { id: true, label: true, color: true, order: true },
    });
    return NextResponse.json(value);
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

// DELETE — remove a value and (by cascade) every attendee assignment of it.
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { eventId, groupId, valueId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

  if (!(await valueInScope(eventId, groupId, valueId))) {
    return NextResponse.json({ error: "Value not found" }, { status: 404 });
  }

  await prisma.attendeeGroupValue.delete({ where: { id: valueId } });
  return NextResponse.json({ success: true });
}
