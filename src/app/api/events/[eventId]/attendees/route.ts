import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const searchParams = req.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") || "";
  const status = searchParams.get("status") || "";

  const where: Record<string, unknown> = { eventId };

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { organization: { contains: search, mode: "insensitive" } },
    ];
  }

  if (category) {
    where.category = category;
  }

  if (status) {
    where.status = status;
  }

  try {
    // Batch all queries in a single transaction to minimize connection usage
    const [event, contacts, templates] = await prisma.$transaction([
      prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, name: true, slug: true, categories: true },
      }),
      prisma.contact.findMany({
        where,
        include: { registration: { select: { status: true, registeredAt: true, confirmationCode: true } } },
        orderBy: [{ category: "asc" }, { createdAt: "desc" }],
      }),
      prisma.emailTemplate.findMany({
        where: { eventId },
        select: { id: true, name: true, type: true, subject: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Group by category
    const groups: Record<string, typeof contacts> = {};
    for (const contact of contacts) {
      const key = contact.category || "Uncategorized";
      if (!groups[key]) groups[key] = [];
      groups[key].push(contact);
    }

    // Count statuses
    const statusCounts = { IMPORTED: 0, INVITED: 0, REGISTERED: 0, CANCELLED: 0 };
    for (const contact of contacts) {
      statusCounts[contact.status]++;
    }

    return NextResponse.json({
      event,
      templates,
      groups: Object.entries(groups).map(([cat, items]) => ({
        category: cat,
        count: items.length,
        contacts: items,
      })),
      statusCounts,
      total: contacts.length,
    });
  } catch (e) {
    console.error("Failed to fetch attendees data:", e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
