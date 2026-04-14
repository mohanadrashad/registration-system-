import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicRegistrationSchema } from "@/lib/validations/registration";
import { randomBytes } from "crypto";
import { approvalService } from "@/lib/services/approval.service";

// GET: Look up contact by invite token to pre-fill the registration form
// Also returns event details and branding for the registration page
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventSlug: string }> }
) {
  const { eventSlug } = await params;
  const token = req.nextUrl.searchParams.get("token");

  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    include: {
      branding: true,
      formFields: {
        where: { isActive: true },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!event || !event.isActive) {
    return NextResponse.json({ error: "Event not found or not active" }, { status: 404 });
  }

  // Build response with event info, branding, and form fields
  const response: Record<string, unknown> = {
    eventName: event.name,
    eventDescription: event.description,
    venue: event.venue,
    startDate: event.startDate,
    endDate: event.endDate,
    branding: event.branding ? {
      primaryColor: event.branding.primaryColor,
      secondaryColor: event.branding.secondaryColor,
      backgroundColor: event.branding.backgroundColor,
      textColor: event.branding.textColor,
      logoUrl: event.branding.logoUrl,
      headerImageUrl: event.branding.headerImageUrl,
      welcomeTitle: event.branding.welcomeTitle,
      welcomeTitleAr: event.branding.welcomeTitleAr,
      welcomeMessage: event.branding.welcomeMessage,
      welcomeMessageAr: event.branding.welcomeMessageAr,
      footerText: event.branding.footerText,
      footerTextAr: event.branding.footerTextAr,
      customCss: event.branding.customCss,
    } : null,
    formFields: event.formFields.map((field) => ({
      id: field.id,
      name: field.name,
      label: field.label,
      labelAr: field.labelAr,
      type: field.type,
      placeholder: field.placeholder,
      placeholderAr: field.placeholderAr,
      helpText: field.helpText,
      helpTextAr: field.helpTextAr,
      required: field.required,
      validation: field.validation,
      options: field.options,
      order: field.order,
      width: field.width,
      section: field.section,
      conditional: field.conditional,
      isSystem: field.isSystem,
      defaultValue: field.defaultValue,
    })),
  };

  // If token provided, look up the contact
  if (token) {
    const contact = await prisma.contact.findUnique({
      where: { inviteToken: token },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        organization: true,
        designation: true,
        metadata: true,
      },
    });

    if (contact) {
      response.contact = contact;
    }
  }

  return NextResponse.json(response);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventSlug: string }> }
) {
  const { eventSlug } = await params;
  const token = req.nextUrl.searchParams.get("token");

  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    include: {
      formFields: {
        where: { isActive: true },
      },
    },
  });

  if (!event || !event.isActive) {
    return NextResponse.json({ error: "Event not found or not active" }, { status: 404 });
  }

  const body = await req.json();

  // Extract core contact fields and additional form data
  const { firstName, lastName, email, phone, organization, designation, ...additionalFields } = body;

  // Validate required fields
  if (!firstName || !lastName || !email) {
    return NextResponse.json({ error: "First name, last name, and email are required" }, { status: 400 });
  }

  // Validate required form fields
  for (const field of event.formFields) {
    if (field.required && !field.isSystem) {
      const value = additionalFields[field.name];
      if (value === undefined || value === null || value === "") {
        return NextResponse.json({
          error: `${field.label} is required`
        }, { status: 400 });
      }
    }
  }

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

  // Store additional form fields in metadata
  const metadata = Object.keys(additionalFields).length > 0 ? additionalFields : null;

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
        metadata,
        inviteToken: randomBytes(16).toString("hex"),
      },
      include: { registration: true },
    });
  } else {
    // Update existing invited contact
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: {
        firstName,
        lastName,
        email: email.toLowerCase(),
        phone: phone || contact.phone,
        organization: organization || contact.organization,
        designation: designation || contact.designation,
        metadata: metadata || contact.metadata,
      },
      include: { registration: true },
    });
  }

  // Determine registration status based on event settings
  const registrationStatus = await approvalService.determineRegistrationStatus(event.id);
  const isConfirmed = registrationStatus === "CONFIRMED";

  const registration = await prisma.registration.create({
    data: {
      contactId: contact.id,
      eventId: event.id,
      status: registrationStatus,
      registeredAt: isConfirmed ? new Date() : null,
      formData: body, // Store all form data
    },
  });

  // Update contact status based on registration status
  const contactStatus = isConfirmed ? "REGISTERED" : "INVITED";
  await prisma.contact.update({
    where: { id: contact.id },
    data: { status: contactStatus },
  });

  // Return appropriate message based on status
  let message = "Registration successful!";
  if (registrationStatus === "PENDING_APPROVAL") {
    message = "Registration submitted! Your request is pending approval.";
  } else if (registrationStatus === "WAITLISTED") {
    message = "You have been added to the waitlist. We will notify you when a spot becomes available.";
  }

  return NextResponse.json({
    success: true,
    confirmationCode: registration.confirmationCode,
    status: registrationStatus,
    message,
  }, { status: 201 });
}
