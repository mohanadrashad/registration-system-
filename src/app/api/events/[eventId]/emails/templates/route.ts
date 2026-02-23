import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createEmailTemplateSchema } from "@/lib/validations/email-template";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  try {
    const templates = await prisma.emailTemplate.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { campaigns: true } } },
    });
    return NextResponse.json(templates);
  } catch (e) {
    console.error("Failed to fetch templates:", e);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const body = await req.json();
  const result = createEmailTemplateSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const template = await prisma.emailTemplate.create({
    data: {
      ...result.data,
      eventId,
      variables: result.data.variables || [],
    },
  });

  return NextResponse.json(template, { status: 201 });
}
