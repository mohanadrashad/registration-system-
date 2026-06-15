import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { groupCreateSchema } from "@/lib/validations/attendee-group";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET — all attendee groups for the event, each with its ordered values.
export async function GET(_req: Request, { params }: RouteParams) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "authenticated" });
  if (ctx instanceof NextResponse) return ctx;

  const groups = await prisma.attendeeGroup.findMany({
    where: { eventId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      values: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true, label: true, color: true, order: true },
      },
    },
  });

  return NextResponse.json(groups);
}

// POST — create a new group ("Ranking", "Region", …).
export async function POST(req: Request, { params }: RouteParams) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

  const raw = await req.json().catch(() => null);
  const parsed = groupCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const order = await prisma.attendeeGroup.count({ where: { eventId } });
    const group = await prisma.attendeeGroup.create({
      data: {
        eventId,
        name: parsed.data.name,
        allowMultiple: parsed.data.allowMultiple,
        order,
      },
      include: { values: true },
    });
    return NextResponse.json(group, { status: 201 });
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
