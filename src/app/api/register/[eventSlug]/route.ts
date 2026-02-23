import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicRegistrationSchema } from "@/lib/validations/registration";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventSlug: string }> }
) {
  const { eventSlug } = await params;

  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
  });

  if (!event || !event.isActive) {
    return NextResponse.json({ error: "Event not found or not active" }, { status: 404 });
  }

  const body = await req.json();
  const result = publicRegistrationSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const { firstName, lastName, email, phone, organization, designation } = result.data;

  // Find or create the contact
  let contact = await prisma.contact.findUnique({
    where: { eventId_email: { eventId: event.id, email: email.toLowerCase() } },
    include: { registration: true },
  });

  if (contact?.registration) {
    return NextResponse.json(
      { error: "You are already registered for this event", confirmationCode: contact.registration.confirmationCode },
      { status: 409 }
    );
  }

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        eventId: event.id,
        firstName,
        lastName,
        email: email.toLowerCase(),
        phone: phone || null,
        organization: organization || null,
        designation: designation || null,
      },
      include: { registration: true },
    });
  }

  const registration = await prisma.registration.create({
    data: {
      contactId: contact.id,
      eventId: event.id,
      status: "CONFIRMED",
      registeredAt: new Date(),
    },
  });

  await prisma.contact.update({
    where: { id: contact.id },
    data: { status: "REGISTERED" },
  });

  return NextResponse.json({
    success: true,
    confirmationCode: registration.confirmationCode,
    message: "Registration successful!",
  }, { status: 201 });
}
