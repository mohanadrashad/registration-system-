import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize, apiError } from "@/lib/api-auth";
import { createEventSchema } from "@/lib/validations/event";
import slugify from "slugify";

export async function GET() {
  const authResult = await authorize("authenticated");
  if (authResult instanceof NextResponse) return authResult;

  const { role, session } = authResult;
  const where: Prisma.EventWhereInput =
    role === "SUPER_ADMIN"
      ? {}
      : { members: { some: { userId: session.user.id } } };

  const events = await prisma.event.findMany({
    where,
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
  // Only SUPER_ADMIN can create events.
  const authResult = await authorize("super_admin");
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json();
  const result = createEventSchema.safeParse(body);

  if (!result.success) {
    return apiError(JSON.stringify(result.error.flatten()), 400);
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
      modules: {
        create: {}, // defaults
      },
      phases: {
        create: {
          type: "REGISTRATION",
          title: "Registration",
          titleAr: "التسجيل",
          order: 0,
          steps: {
            create: { title: "Details", titleAr: "التفاصيل", order: 0 },
          },
        },
      },
    },
    include: {
      modules: true,
    },
  });

  return NextResponse.json(event, { status: 201 });
}
