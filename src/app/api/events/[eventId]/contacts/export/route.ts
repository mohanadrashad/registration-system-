import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import Papa from "papaparse";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const format = req.nextUrl.searchParams.get("format") || "csv";

  const contacts = await prisma.contact.findMany({
    where: { eventId },
    include: {
      registration: { select: { status: true, registeredAt: true, confirmationCode: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const data = contacts.map((c) => ({
    "First Name": c.firstName,
    "Last Name": c.lastName,
    Email: c.email,
    Phone: c.phone || "",
    Organization: c.organization || "",
    Designation: c.designation || "",
    Category: c.category || "",
    "Registration Status": c.registration?.status || "NOT REGISTERED",
    "Registered At": c.registration?.registeredAt?.toISOString() || "",
  }));

  if (format === "csv") {
    const csv = Papa.unparse(data);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="contacts-${eventId}.csv"`,
      },
    });
  }

  return NextResponse.json(data);
}
