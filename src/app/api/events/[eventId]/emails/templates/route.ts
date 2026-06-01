import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { createEmailTemplateSchema } from "@/lib/validations/email-template";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "authenticated" });
  if (ctx instanceof NextResponse) return ctx;

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
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

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
