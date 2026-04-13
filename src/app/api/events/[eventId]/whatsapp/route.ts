import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - Get WhatsApp settings for an event
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        whatsAppSettings: true,
        modules: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check if WhatsApp module is enabled
    if (!event.modules?.whatsApp) {
      return NextResponse.json(
        { error: "WhatsApp module is not enabled for this event" },
        { status: 403 }
      );
    }

    return NextResponse.json(event.whatsAppSettings || {
      isActive: false,
      provider: "META",
    });
  } catch (error) {
    console.error("Error getting WhatsApp settings:", error);
    return NextResponse.json(
      { error: "Failed to get WhatsApp settings" },
      { status: 500 }
    );
  }
}

// POST - Create or update WhatsApp settings
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;
    const body = await request.json();

    // Check if event exists and module is enabled
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { modules: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!event.modules?.whatsApp) {
      return NextResponse.json(
        { error: "WhatsApp module is not enabled for this event" },
        { status: 403 }
      );
    }

    const {
      isActive,
      provider,
      phoneNumberId,
      businessAccountId,
      accessToken,
      webhookVerifyToken,
      confirmationTemplate,
      reminderTemplate,
      badgeTemplate,
    } = body;

    const settings = await prisma.eventWhatsAppSettings.upsert({
      where: { eventId },
      update: {
        isActive: isActive ?? false,
        provider: provider || "META",
        phoneNumberId,
        businessAccountId,
        accessToken,
        webhookVerifyToken,
        confirmationTemplate,
        reminderTemplate,
        badgeTemplate,
      },
      create: {
        eventId,
        isActive: isActive ?? false,
        provider: provider || "META",
        phoneNumberId,
        businessAccountId,
        accessToken,
        webhookVerifyToken,
        confirmationTemplate,
        reminderTemplate,
        badgeTemplate,
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error saving WhatsApp settings:", error);
    return NextResponse.json(
      { error: "Failed to save WhatsApp settings" },
      { status: 500 }
    );
  }
}
