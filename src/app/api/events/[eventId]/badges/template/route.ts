import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "authenticated" });
  if (ctx instanceof NextResponse) return ctx;

  const template = await prisma.badgeTemplate.findUnique({
    where: { eventId },
  });

  return NextResponse.json(template);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();

  const template = await prisma.badgeTemplate.upsert({
    where: { eventId },
    update: {
      name: body.name,
      designJson: body.designJson,
      width: body.width || 400,
      height: body.height || 600,
      backgroundUrl: body.backgroundUrl,
    },
    create: {
      eventId,
      name: body.name || "Default Badge",
      designJson: body.designJson || {},
      width: body.width || 400,
      height: body.height || 600,
      backgroundUrl: body.backgroundUrl,
    },
  });

  return NextResponse.json(template);
}
