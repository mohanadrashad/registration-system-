import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ eventSlug: string }>;
}

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

    // Find event
    const event = await prisma.event.findUnique({
      where: { slug: eventSlug },
      include: {
        modules: true,
        branding: true,
      },
    });

    if (!event || !event.isActive) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check if self-service portal is enabled
    if (!event.modules?.selfServicePortal) {
      return NextResponse.json(
        { error: "Self-service portal is not enabled for this event" },
        { status: 403 }
      );
    }

    // Find registration
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

// POST - Update registration details
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

    // Find event
    const event = await prisma.event.findUnique({
      where: { slug: eventSlug },
      include: { modules: true },
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

    // Find registration
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

    // Handle cancel action
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

    // Handle update action
    if (updates) {
      const allowedUpdates: Record<string, unknown> = {};

      // Only allow updating certain fields
      if (updates.phone) allowedUpdates.phone = updates.phone;
      if (updates.organization) allowedUpdates.organization = updates.organization;
      if (updates.designation) allowedUpdates.designation = updates.designation;

      if (Object.keys(allowedUpdates).length > 0) {
        await prisma.contact.update({
          where: { id: registration.contactId },
          data: allowedUpdates,
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
