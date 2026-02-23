import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; campaignId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { campaignId } = await params;
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    include: {
      template: true,
      logs: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { contact: { select: { firstName: true, lastName: true, email: true } } },
      },
    },
  });

  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(campaign);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; campaignId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { campaignId } = await params;
  await prisma.emailCampaign.delete({ where: { id: campaignId } });
  return NextResponse.json({ success: true });
}
