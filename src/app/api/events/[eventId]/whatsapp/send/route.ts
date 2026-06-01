import { NextResponse } from "next/server";
import { authorizeEvent } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { whatsAppService } from "@/lib/services/whatsapp.service";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// POST - Send WhatsApp message
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "editor", module: "whatsApp" });
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();

    const { type, registrationId, contactIds } = body;

    // Inline credentials check (separate concern from the module gate
    // above): the module being on means the feature is enabled for
    // this event; this check verifies the actual WhatsApp credentials
    // are configured and active. An event can have the module on but
    // no credentials yet — 400 instead of letting the send attempt fail.
    const isEnabled = await whatsAppService.isEnabled(eventId);
    if (!isEnabled) {
      return NextResponse.json(
        { error: "WhatsApp is not configured for this event" },
        { status: 400 }
      );
    }

    switch (type) {
      case "confirmation": {
        if (!registrationId) {
          return NextResponse.json(
            { error: "registrationId is required" },
            { status: 400 }
          );
        }
        const result = await whatsAppService.sendConfirmation(registrationId);
        return NextResponse.json(result);
      }

      case "badge": {
        if (!registrationId) {
          return NextResponse.json(
            { error: "registrationId is required" },
            { status: 400 }
          );
        }
        const registration = await prisma.registration.findUnique({
          where: { id: registrationId },
        });
        if (!registration?.badgeUrl) {
          return NextResponse.json(
            { error: "Badge not generated for this registration" },
            { status: 400 }
          );
        }
        const result = await whatsAppService.sendBadge(registrationId, registration.badgeUrl);
        return NextResponse.json(result);
      }

      case "reminder": {
        if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
          return NextResponse.json(
            { error: "contactIds array is required" },
            { status: 400 }
          );
        }
        const result = await whatsAppService.sendReminders(eventId, contactIds);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json(
          { error: "Invalid message type. Use: confirmation, badge, or reminder" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error sending WhatsApp message:", error);
    return NextResponse.json(
      { error: "Failed to send WhatsApp message" },
      { status: 500 }
    );
  }
}
