import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { updateContactSchema } from "@/lib/validations/contact";
import { getRole, canEdit, canDelete } from "@/lib/permissions";

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
      registration: { select: { id: true, status: true, registeredAt: true, confirmationCode: true, badgeEmailSent: true, badgeGenerated: true } },
      emailLogs: { select: { id: true, status: true, sentAt: true, subject: true }, orderBy: { sentAt: "desc" } },
      event: { select: { slug: true, name: true, categories: true } },
    },
  });

  if (!contact || contact.eventId !== eventId) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  // Scope the "Attendee Information" panel to fields from the
  // REGISTRATION phase only. Post-registration phase fields live on
  // their own submissions and shouldn't bleed into the attendee
  // overview (otherwise stale or unrelated rows like leftover test
  // fields on a Flight Info phase pollute every attendee row).
  const formFields = await prisma.formField.findMany({
    where: {
      eventId,
      isActive: true,
      step: { phase: { type: "REGISTRATION" } },
    },
    orderBy: { order: "asc" },
    select: { name: true, label: true, labelAr: true, type: true, options: true, isSystem: true },
  });

  return NextResponse.json({ ...contact, formFields });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ eventId: string; contactId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(getRole(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { contactId } = await params;
  const body = await req.json();
  const result = updateContactSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const { metadata, ...rest } = result.data;
  const data: Prisma.ContactUpdateInput = { ...rest };
  if (metadata !== undefined) {
    data.metadata = metadata === null ? Prisma.DbNull : (metadata as Prisma.InputJsonValue);
  }

  try {
    const contact = await prisma.contact.update({
      where: { id: contactId },
      data,
    });
    return NextResponse.json(contact);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Most likely the @@unique([eventId, email]) constraint.
      return NextResponse.json(
        {
          error:
            "That email is already used by another attendee on this event.",
        },
        { status: 409 }
      );
    }
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; contactId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canDelete(getRole(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { contactId } = await params;

  try {
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
