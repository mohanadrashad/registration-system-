import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import Papa from "papaparse";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  // Read-only endpoint: any event member can fetch this.
  // "authenticated" is the lowest RoleRequirement and maps to
  // canViewEvent (passes when eventRole !== null OR SUPER_ADMIN).
  // Mirrors the Stage 2 approvals-GET migration — closes the
  // asymmetric posture where Stage 2's PUT/DELETE/POST migrations
  // gated writes per-event but reads remained open to any logged-in
  // user across the codebase.
  const ctx = await authorizeEvent(eventId, { role: "authenticated" });
  if (ctx instanceof NextResponse) return ctx;
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
