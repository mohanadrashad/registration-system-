import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "authenticated" });
  if (ctx instanceof NextResponse) return ctx;

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
