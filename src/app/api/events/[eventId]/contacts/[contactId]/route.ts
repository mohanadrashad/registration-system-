import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { updateContactSchema } from "@/lib/validations/contact";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; contactId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId, contactId } = await params;

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      registration: { select: { status: true, registeredAt: true, confirmationCode: true } },
      emailLogs: { select: { id: true, status: true, sentAt: true, subject: true }, orderBy: { sentAt: "desc" } },
      event: { select: { slug: true, name: true, categories: true } },
    },
  });

  if (!contact || contact.eventId !== eventId) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  return NextResponse.json(contact);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ eventId: string; contactId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contactId } = await params;
  const body = await req.json();
  const result = updateContactSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const contact = await prisma.contact.update({
    where: { id: contactId },
    data: result.data,
  });

  return NextResponse.json(contact);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; contactId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contactId } = await params;

  try {
    // Delete related records first, then the contact
    await prisma.$transaction([
      prisma.emailLog.deleteMany({ where: { contactId } }),
      prisma.registration.deleteMany({ where: { contactId } }),
      prisma.contact.delete({ where: { id: contactId } }),
    ]);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete attendee" }, { status: 500 });
  }
}
