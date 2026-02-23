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

  try {
    const [event, contacts, emailLogs, campaigns] = await prisma.$transaction([
      prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, name: true, categories: true, startDate: true, endDate: true, venue: true },
      }),
      prisma.contact.findMany({
        where: { eventId },
        select: { status: true, category: true, createdAt: true },
      }),
      prisma.emailLog.findMany({
        where: { campaign: { eventId } },
        select: { status: true, sentAt: true },
      }),
      prisma.emailCampaign.findMany({
        where: { eventId },
        select: { id: true, name: true, status: true, sentCount: true, failedCount: true, totalRecipients: true, sentAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Status breakdown
    const statusCounts = { IMPORTED: 0, INVITED: 0, REGISTERED: 0, CANCELLED: 0 };
    for (const c of contacts) {
      statusCounts[c.status]++;
    }

    // Category breakdown
    const categoryBreakdown: Record<string, { total: number; IMPORTED: number; INVITED: number; REGISTERED: number; CANCELLED: number }> = {};
    for (const c of contacts) {
      const cat = c.category || "Uncategorized";
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = { total: 0, IMPORTED: 0, INVITED: 0, REGISTERED: 0, CANCELLED: 0 };
      }
      categoryBreakdown[cat].total++;
      categoryBreakdown[cat][c.status]++;
    }

    // Email stats
    const emailStats = { sent: 0, failed: 0, total: emailLogs.length };
    for (const log of emailLogs) {
      if (log.status === "SENT") emailStats.sent++;
      else if (log.status === "FAILED") emailStats.failed++;
    }

    // Registration rate
    const totalContacts = contacts.length;
    const registeredCount = statusCounts.REGISTERED;
    const invitedCount = statusCounts.INVITED;
    const registrationRate = totalContacts > 0 ? Math.round((registeredCount / totalContacts) * 100) : 0;
    const inviteRate = totalContacts > 0 ? Math.round(((invitedCount + registeredCount) / totalContacts) * 100) : 0;

    return NextResponse.json({
      event,
      summary: {
        total: totalContacts,
        statusCounts,
        registrationRate,
        inviteRate,
        emailsSent: emailStats.sent,
        emailsFailed: emailStats.failed,
      },
      categoryBreakdown: Object.entries(categoryBreakdown)
        .map(([category, counts]) => ({ category, ...counts }))
        .sort((a, b) => b.total - a.total),
      campaigns: campaigns.slice(0, 10),
    });
  } catch (e) {
    console.error("Failed to fetch statistics:", e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
