import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { updateEventSchema } from "@/lib/validations/event";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId);
  if (ctx instanceof NextResponse) return ctx;

  // authorizeEvent already loaded + existence-checked the event, but its
  // context has no `_count` include — re-query for the payload.
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      _count: {
        select: { contacts: true, registrations: true, emailTemplates: true, emailCampaigns: true },
      },
    },
  });

  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  return NextResponse.json(event);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const result = updateEventSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const data: Record<string, unknown> = { ...result.data };
  if (data.startDate) data.startDate = new Date(data.startDate as string);
  if (data.endDate) data.endDate = new Date(data.endDate as string);
  if (data.categories) data.categories = data.categories as string[];

  const event = await prisma.event.update({
    where: { id: eventId },
    data,
  });

  return NextResponse.json(event);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "manager" });
  if (ctx instanceof NextResponse) return ctx;

  await prisma.event.delete({ where: { id: eventId } });

  return NextResponse.json({ success: true });
}
