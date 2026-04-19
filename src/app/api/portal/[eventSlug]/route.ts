import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ eventSlug: string }>;
}

const COLUMN_FIELDS = new Set([
  "firstName",
  "lastName",
  "email",
  "phone",
  "organization",
  "designation",
]);

const LAYOUT_TYPES = new Set(["HEADING", "DIVIDER", "PARAGRAPH", "HIDDEN"]);

// GET - Get registration details by email and confirmation code
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { eventSlug } = await params;
    const email = req.nextUrl.searchParams.get("email");
    const code = req.nextUrl.searchParams.get("code");

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email and confirmation code are required" },
        { status: 400 }
      );
    }

    const event = await prisma.event.findUnique({
      where: { slug: eventSlug },
      include: {
        modules: true,
        branding: true,
        formFields: {
          where: { isActive: true },
          orderBy: { order: "asc" },
          select: {
            name: true,
            label: true,
            labelAr: true,
            type: true,
            options: true,
            required: true,
            isSystem: true,
          },
        },
      },
    });

    if (!event || !event.isActive) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!event.modules?.selfServicePortal) {
      return NextResponse.json(
        { error: "Self-service portal is not enabled for this event" },
        { status: 403 }
      );
    }

    const registration = await prisma.registration.findFirst({
      where: {
        eventId: event.id,
        confirmationCode: code,
        contact: {
          email: email.toLowerCase(),
        },
      },
      include: {
        contact: true,
        badge: true,
      },
    });

    if (!registration) {
      return NextResponse.json(
        { error: "Registration not found. Please check your email and confirmation code." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      event: {
        name: event.name,
        description: event.description,
        venue: event.venue,
        startDate: event.startDate,
        endDate: event.endDate,
        branding: event.branding,
        formFields: event.formFields,
      },
      registration: {
        id: registration.id,
        status: registration.status,
        confirmationCode: registration.confirmationCode,
        registeredAt: registration.registeredAt,
        badgeGenerated: registration.badgeGenerated,
        badgeUrl: registration.badgeUrl,
      },
      contact: {
        firstName: registration.contact.firstName,
        lastName: registration.contact.lastName,
        email: registration.contact.email,
        phone: registration.contact.phone,
        organization: registration.contact.organization,
        designation: registration.contact.designation,
        metadata: registration.contact.metadata,
      },
    });
  } catch (error) {
    console.error("Portal lookup error:", error);
    return NextResponse.json(
      { error: "Failed to lookup registration" },
      { status: 500 }
    );
  }
}

// POST - Update registration details or cancel
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { eventSlug } = await params;
    const body = await req.json();
    const { email, code, updates, action } = body;

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email and confirmation code are required" },
        { status: 400 }
      );
    }

    const event = await prisma.event.findUnique({
      where: { slug: eventSlug },
      include: {
        modules: true,
        formFields: {
          where: { isActive: true },
          select: { name: true, type: true, required: true, label: true },
        },
      },
    });

    if (!event || !event.isActive) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!event.modules?.selfServicePortal) {
      return NextResponse.json(
        { error: "Self-service portal is not enabled" },
        { status: 403 }
      );
    }

    const registration = await prisma.registration.findFirst({
      where: {
        eventId: event.id,
        confirmationCode: code,
        contact: {
          email: email.toLowerCase(),
        },
      },
      include: { contact: true },
    });

    if (!registration) {
      return NextResponse.json(
        { error: "Registration not found" },
        { status: 404 }
      );
    }

    if (action === "cancel") {
      if (registration.status === "CANCELLED") {
        return NextResponse.json(
          { error: "Registration is already cancelled" },
          { status: 400 }
        );
      }

      await prisma.registration.update({
        where: { id: registration.id },
        data: { status: "CANCELLED" },
      });

      await prisma.contact.update({
        where: { id: registration.contactId },
        data: { status: "CANCELLED" },
      });

      return NextResponse.json({
        success: true,
        message: "Registration cancelled successfully",
      });
    }

    if (updates && typeof updates === "object") {
      const allowedNames = new Set(
        (event.formFields || [])
          .filter((f) => !LAYOUT_TYPES.has(f.type) && f.name !== "email")
          .map((f) => f.name)
      );

      for (const field of event.formFields || []) {
        if (!field.required || LAYOUT_TYPES.has(field.type) || field.name === "email") continue;
        const v = (updates as Record<string, unknown>)[field.name];
        if (v === undefined || v === null || v === "") {
          return NextResponse.json(
            { error: `${field.label} is required` },
            { status: 400 }
          );
        }
      }

      const columnUpdates: Record<string, unknown> = {};
      const existingMetadata = (registration.contact.metadata as Record<string, unknown>) || {};
      const metadataUpdates: Record<string, unknown> = { ...existingMetadata };

      for (const [name, value] of Object.entries(updates as Record<string, unknown>)) {
        if (!allowedNames.has(name)) continue;
        if (COLUMN_FIELDS.has(name)) {
          columnUpdates[name] = value === "" || value === undefined ? null : value;
        } else {
          metadataUpdates[name] = value;
        }
      }

      const data: Prisma.ContactUpdateInput = { ...columnUpdates };
      if (Object.keys(metadataUpdates).length > 0) {
        data.metadata = metadataUpdates as Prisma.InputJsonValue;
      }

      if (Object.keys(data).length > 0) {
        await prisma.contact.update({
          where: { id: registration.contactId },
          data,
        });
      }

      return NextResponse.json({
        success: true,
        message: "Details updated successfully",
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Portal update error:", error);
    return NextResponse.json(
      { error: "Failed to update registration" },
      { status: 500 }
    );
  }
}
