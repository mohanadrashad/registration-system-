import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicRegistrationSchema } from "@/lib/validations/registration";
import { randomBytes } from "crypto";

// GET: Look up contact by invite token to pre-fill the registration form
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventSlug: string }> }
) {
  const { eventSlug } = await params;
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "No token provided" }, { status: 400 });
  }

  const event = await prisma.event.findUnique({ where: { slug: eventSlug } });
  if (!event || !event.isActive) {
    return NextResponse.json({ error: "Event not found or not active" }, { status: 404 });
  }

  const contact = await prisma.contact.findUnique({
    where: { inviteToken: token },
    select: { firstName: true, lastName: true, email: true, phone: true, organization: true, designation: true },
  });

  if (!contact) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  return NextResponse.json({ contact, eventName: event.name });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventSlug: string }> }
) {
  const { eventSlug } = await params;
  const token = req.nextUrl.searchParams.get("token");

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

  // If a token is provided, look up the invited contact first
  let contact = null;
  if (token) {
    contact = await prisma.contact.findUnique({
      where: { inviteToken: token },
      include: { registration: true },
    });
  }

  // Fall back to email lookup if no token match
  if (!contact) {
    contact = await prisma.contact.findUnique({
      where: { eventId_email: { eventId: event.id, email: email.toLowerCase() } },
      include: { registration: true },
    });
  }

  if (contact?.status === "REGISTERED" && contact.registration) {
    return NextResponse.json(
      { error: "You are already registered for this event", confirmationCode: contact.registration.confirmationCode },
      { status: 409 }
    );
  }

  // If contact has an old registration but status was reset by admin, delete the old registration
  if (contact?.registration && contact.status !== "REGISTERED") {
    await prisma.registration.delete({ where: { id: contact.registration.id } });
  }

  if (!contact) {
    // New contact (walk-in / direct link without invite)
    contact = await prisma.contact.create({
      data: {
        eventId: event.id,
        firstName,
        lastName,
        email: email.toLowerCase(),
        phone: phone || null,
        organization: organization || null,
        designation: designation || null,
        inviteToken: randomBytes(16).toString("hex"),
      },
      include: { registration: true },
    });
  } else {
    // Update existing invited contact — they may use a different email
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: {
        firstName,
        lastName,
        email: email.toLowerCase(),
        phone: phone || contact.phone,
        organization: organization || contact.organization,
        designation: designation || contact.designation,
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
