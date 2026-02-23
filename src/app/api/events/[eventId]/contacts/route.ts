import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createContactSchema } from "@/lib/validations/contact";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const search = searchParams.get("search") || "";
  const category = searchParams.get("category") || "";
  const status = searchParams.get("status") || "";
  const groupBy = searchParams.get("groupBy") || "";

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
    // Grouped by category mode for the Attendees page
    if (groupBy === "category") {
      const contacts = await prisma.contact.findMany({
        where,
        include: { registration: { select: { status: true, registeredAt: true, confirmationCode: true } } },
        orderBy: [{ category: "asc" }, { createdAt: "desc" }],
      });

      const groups: Record<string, typeof contacts> = {};
      for (const contact of contacts) {
        const key = contact.category || "Uncategorized";
        if (!groups[key]) groups[key] = [];
        groups[key].push(contact);
      }

      const statusCounts = {
        IMPORTED: 0,
        INVITED: 0,
        REGISTERED: 0,
        CANCELLED: 0,
      };
      for (const contact of contacts) {
        statusCounts[contact.status]++;
      }

      return NextResponse.json({
        groups: Object.entries(groups).map(([cat, items]) => ({
          category: cat,
          count: items.length,
          contacts: items,
        })),
        statusCounts,
        total: contacts.length,
      });
    }

    // Default paginated mode
    const contacts = await prisma.contact.findMany({
      where,
      include: { registration: { select: { status: true, registeredAt: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });
    const total = await prisma.contact.count({ where });

    return NextResponse.json({
      contacts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error("Failed to fetch contacts:", e);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
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
  const result = createContactSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const contact = await prisma.contact.create({
    data: {
      ...result.data,
      eventId,
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
