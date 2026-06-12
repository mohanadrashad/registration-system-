import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";

const bulkDeleteSchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(10_000),
});

/**
 * Bulk attendee deletion. Replaces the page's old one-request-per-contact
 * loop, which at 7k selected contacts meant 7k sequential HTTP requests.
 * Same role and cleanup order as the single-contact DELETE
 * (emailLogs → registration → contact, one transaction).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "manager" });
  if (ctx instanceof NextResponse) return ctx;

  const raw = await req.json().catch(() => null);
  const parsed = bulkDeleteSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "contactIds must be a non-empty array of contact ids" },
      { status: 400 }
    );
  }
  const ids = parsed.data.contactIds;

  try {
    // eventId in every where doubles as the cross-event guard: ids
    // belonging to other events simply don't match and are not counted.
    const [, , contactsResult] = await prisma.$transaction([
      prisma.emailLog.deleteMany({
        where: { contactId: { in: ids }, contact: { eventId } },
      }),
      prisma.registration.deleteMany({
        where: { contactId: { in: ids }, eventId },
      }),
      prisma.contact.deleteMany({
        where: { id: { in: ids }, eventId },
      }),
    ]);

    return NextResponse.json({
      success: true,
      deletedCount: contactsResult.count,
    });
  } catch (e) {
    console.error("Bulk delete failed:", e);
    return NextResponse.json(
      { error: "Failed to delete attendees" },
      { status: 500 }
    );
  }
}
