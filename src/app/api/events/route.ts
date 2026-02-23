import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createEventSchema } from "@/lib/validations/event";
import slugify from "slugify";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { contacts: true, registrations: true },
      },
    },
  });

  return NextResponse.json(events);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const result = createEventSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const { name, description, venue, startDate, endDate } = result.data;
  const slug = slugify(name, { lower: true, strict: true });

  const event = await prisma.event.create({
    data: {
      name,
      slug,
      description,
      venue,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    },
  });

  return NextResponse.json(event, { status: 201 });
}
