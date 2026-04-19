import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { approvalService } from "@/lib/services/approval.service";
import { sanitizeCss } from "@/lib/security/sanitize-css";

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
      customCss: sanitizeCss(event.branding.customCss),
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

  // Determine registration status based on event settings (reads only; safe outside tx)
  const registrationStatus = await approvalService.determineRegistrationStatus(event.id);
  const isConfirmed = registrationStatus === "CONFIRMED";

  const metadata = Object.keys(additionalFields).length > 0 ? additionalFields : null;
  const normalizedEmail = email.toLowerCase();

  try {
    const registration = await prisma.$transaction(async (tx) => {
      // Look up contact by token first, fall back to email
      let contact = token
        ? await tx.contact.findUnique({
            where: { inviteToken: token },
            include: { registration: true },
          })
        : null;

      if (!contact) {
        contact = await tx.contact.findUnique({
          where: { eventId_email: { eventId: event.id, email: normalizedEmail } },
          include: { registration: true },
        });
      }

      // Already registered — surface as a typed error so the outer handler can 409
      if (contact?.status === "REGISTERED" && contact.registration) {
        throw new AlreadyRegisteredError(contact.registration.confirmationCode);
      }

      // Clean up any stale registration (e.g. admin reset contact status)
      if (contact?.registration) {
        await tx.registration.delete({ where: { id: contact.registration.id } });
      }

      const upsertedContact = contact
        ? await tx.contact.update({
            where: { id: contact.id },
            data: {
              firstName,
              lastName,
              email: normalizedEmail,
              phone: phone || contact.phone,
              organization: organization || contact.organization,
              designation: designation || contact.designation,
              metadata: metadata || contact.metadata,
            },
          })
        : await tx.contact.create({
            data: {
              eventId: event.id,
              firstName,
              lastName,
              email: normalizedEmail,
              phone: phone || null,
              organization: organization || null,
              designation: designation || null,
              metadata,
              inviteToken: randomBytes(16).toString("hex"),
            },
          });

      const created = await tx.registration.create({
        data: {
          contactId: upsertedContact.id,
          eventId: event.id,
          status: registrationStatus,
          registeredAt: isConfirmed ? new Date() : null,
          formData: body,
        },
      });

      await tx.contact.update({
        where: { id: upsertedContact.id },
        data: { status: isConfirmed ? "REGISTERED" : "INVITED" },
      });

      return created;
    });

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
  } catch (err) {
    if (err instanceof AlreadyRegisteredError) {
      return NextResponse.json(
        { error: "You are already registered for this event", confirmationCode: err.confirmationCode },
        { status: 409 }
      );
    }

    // Concurrent submit raced us on the unique (contactId) or (eventId, email) constraint
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A registration is already in progress for this email. Please try again." },
        { status: 409 }
      );
    }

    throw err;
  }
}

class AlreadyRegisteredError extends Error {
  constructor(public readonly confirmationCode: string) {
    super("ALREADY_REGISTERED");
    this.name = "AlreadyRegisteredError";
  }
}
