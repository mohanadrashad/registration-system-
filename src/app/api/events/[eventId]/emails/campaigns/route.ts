import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { createEmailCampaignSchema } from "@/lib/validations/email-template";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "authenticated" });
  if (ctx instanceof NextResponse) return ctx;

  const campaigns = await prisma.emailCampaign.findMany({
    where: { eventId },
    include: {
      template: { select: { name: true, type: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(campaigns);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

  const body = await req.json();
  const result = createEmailCampaignSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const campaign = await prisma.emailCampaign.create({
    data: {
      eventId,
      templateId: result.data.templateId,
      name: result.data.name,
      recipientFilter: result.data.recipientFilter || {},
      scheduledAt: result.data.scheduledAt ? new Date(result.data.scheduledAt) : null,
    },
  });

  return NextResponse.json(campaign, { status: 201 });
}
