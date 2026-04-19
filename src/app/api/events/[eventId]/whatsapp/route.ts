import { NextResponse } from "next/server";
import { authorizeEvent } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { EventWhatsAppSettings } from "@prisma/client";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

const MASK = "••••••••";

function maskSettings(settings: EventWhatsAppSettings | null) {
  if (!settings) return { isActive: false, provider: "META" as const };
  return {
    id: settings.id,
    eventId: settings.eventId,
    provider: settings.provider,
    isActive: settings.isActive,
    phoneNumberId: settings.phoneNumberId,
    businessAccountId: settings.businessAccountId,
    accessToken: settings.accessToken ? MASK : null,
    webhookVerifyToken: settings.webhookVerifyToken ? MASK : null,
    confirmationTemplate: settings.confirmationTemplate,
    reminderTemplate: settings.reminderTemplate,
    badgeTemplate: settings.badgeTemplate,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

// GET - Get WhatsApp settings for an event
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;

    const ctx = await authorizeEvent(eventId, { module: "whatsApp" });
    if (ctx instanceof NextResponse) return ctx;

    const settings = await prisma.eventWhatsAppSettings.findUnique({
      where: { eventId },
    });

    return NextResponse.json(maskSettings(settings));
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
    const { eventId } = await params;

    const ctx = await authorizeEvent(eventId, {
      role: "editor",
      module: "whatsApp",
    });
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();

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

    // Preserve existing secrets when client submits the mask placeholder
    const existing = await prisma.eventWhatsAppSettings.findUnique({
      where: { eventId },
    });
    const resolvedAccessToken =
      accessToken === MASK ? existing?.accessToken ?? null : accessToken ?? null;
    const resolvedVerifyToken =
      webhookVerifyToken === MASK
        ? existing?.webhookVerifyToken ?? null
        : webhookVerifyToken ?? null;

    const settings = await prisma.eventWhatsAppSettings.upsert({
      where: { eventId },
      update: {
        isActive: isActive ?? false,
        provider: provider || "META",
        phoneNumberId,
        businessAccountId,
        accessToken: resolvedAccessToken,
        webhookVerifyToken: resolvedVerifyToken,
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
        accessToken: resolvedAccessToken,
        webhookVerifyToken: resolvedVerifyToken,
        confirmationTemplate,
        reminderTemplate,
        badgeTemplate,
      },
    });

    return NextResponse.json(maskSettings(settings));
  } catch (error) {
    console.error("Error saving WhatsApp settings:", error);
    return NextResponse.json(
      { error: "Failed to save WhatsApp settings" },
      { status: 500 }
    );
  }
}
