import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; campaignId: string }> }
) {
  const { eventId, campaignId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "authenticated" });
  if (ctx instanceof NextResponse) return ctx;

  // Cross-event scoping. authorizeEvent verifies the CALLER's membership
  // on the URL eventId; switching findUnique → findFirst lets us also
  // scope the data lookup so a campaign belonging to another event
  // returns 404 instead of leaking. Same row-level check pattern as
  // contacts/[contactId]/route.ts.
  const campaign = await prisma.emailCampaign.findFirst({
    where: { id: campaignId, eventId },
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
  const { eventId, campaignId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "manager" });
  if (ctx instanceof NextResponse) return ctx;

  // Cross-event scoping via deleteMany + count check. Single round-trip,
  // no read-then-write race window; deletes 0 rows (and returns 404)
  // if the campaign id belongs to a different event.
  const result = await prisma.emailCampaign.deleteMany({
    where: { id: campaignId, eventId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
