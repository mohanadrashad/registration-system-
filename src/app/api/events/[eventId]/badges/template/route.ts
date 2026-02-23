import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const template = await prisma.badgeTemplate.findUnique({
    where: { eventId },
  });

  return NextResponse.json(template);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
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
