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
  const status = searchParams.get("status");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = { eventId };
  if (status) where.status = status;

  const registrations = await prisma.registration.findMany({
    where,
    include: {
      contact: true,
      badge: { select: { id: true, pdfUrl: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  let filtered = registrations;
  if (search) {
    const s = search.toLowerCase();
    filtered = registrations.filter(
      (r) =>
        r.contact.firstName.toLowerCase().includes(s) ||
        r.contact.lastName.toLowerCase().includes(s) ||
        r.contact.email.toLowerCase().includes(s)
    );
  }

  return NextResponse.json(filtered);
}
