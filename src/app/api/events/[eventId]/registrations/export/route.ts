import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import Papa from "papaparse";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;

  const registrations = await prisma.registration.findMany({
    where: { eventId },
    include: { contact: true },
    orderBy: { registeredAt: "asc" },
  });

  const data = registrations.map((r) => ({
    "First Name": r.contact.firstName,
    "Last Name": r.contact.lastName,
    Email: r.contact.email,
    Phone: r.contact.phone || "",
    Organization: r.contact.organization || "",
    Designation: r.contact.designation || "",
    Category: r.contact.category || "",
    Status: r.status,
    "Registered At": r.registeredAt?.toISOString() || "",
    "Confirmation Code": r.confirmationCode,
  }));

  const csv = Papa.unparse(data);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="registrations-${eventId}.csv"`,
    },
  });
}
