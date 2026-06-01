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

  try {
    const total = await prisma.registration.count({ where: { eventId } });
    const confirmed = await prisma.registration.count({ where: { eventId, status: "CONFIRMED" } });
    const pending = await prisma.registration.count({ where: { eventId, status: "PENDING" } });
    const cancelled = await prisma.registration.count({ where: { eventId, status: "CANCELLED" } });
    const totalContacts = await prisma.contact.count({ where: { eventId } });

    return NextResponse.json({
      total,
      confirmed,
      pending,
      cancelled,
      totalContacts,
      conversionRate: totalContacts > 0 ? Math.round((total / totalContacts) * 100) : 0,
    });
  } catch (e) {
    console.error("Failed to fetch registration stats:", e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
