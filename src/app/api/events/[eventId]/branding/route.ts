import { NextResponse } from "next/server";
import { authorize } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { sanitizeCss } from "@/lib/security/sanitize-css";
import { brandingUpdateSchema } from "@/lib/validations/branding";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - Get branding settings for an event
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const ctx = await authorize();
    if (ctx instanceof NextResponse) return ctx;

    const { eventId } = await params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        branding: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Return branding or defaults
    return NextResponse.json(event.branding || {
      primaryColor: "#7dc242",
      secondaryColor: null,
      backgroundColor: null,
      textColor: null,
      logoUrl: null,
      logoWhiteUrl: null,
      faviconUrl: null,
      headerImageUrl: null,
      headerColor: null,
      headerShowLogo: true,
      logoHeight: null,
      customCss: null,
      welcomeTitle: null,
      welcomeTitleAr: null,
      welcomeMessage: null,
      welcomeMessageAr: null,
      footerText: null,
      footerTextAr: null,
    });
  } catch (error) {
    console.error("Error getting branding settings:", error);
    return NextResponse.json(
      { error: "Failed to get branding settings" },
      { status: 500 }
    );
  }
}

// POST - Create or update branding settings
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const ctx = await authorize("editor");
    if (ctx instanceof NextResponse) return ctx;

    const { eventId } = await params;
    const body = await request.json();

    const parsed = brandingUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid branding settings", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const {
      primaryColor,
      secondaryColor,
      backgroundColor,
      textColor,
      logoUrl,
      logoWhiteUrl,
      faviconUrl,
      headerImageUrl,
      headerColor,
      headerShowLogo,
      logoHeight,
      customCss,
      welcomeTitle,
      welcomeTitleAr,
      welcomeMessage,
      welcomeMessageAr,
      footerText,
      footerTextAr,
    } = parsed.data;

    // headerShowLogo defaults true at the DB; only override when the client
    // actually sent a boolean (undefined leaves the column / default intact).
    const showLogoUpdate =
      headerShowLogo === undefined ? {} : { headerShowLogo };

    const branding = await prisma.eventBranding.upsert({
      where: { eventId },
      update: {
        primaryColor: primaryColor || "#7dc242",
        secondaryColor,
        backgroundColor,
        textColor,
        logoUrl,
        logoWhiteUrl,
        faviconUrl,
        headerImageUrl,
        headerColor,
        ...showLogoUpdate,
        logoHeight,
        customCss: customCss ? sanitizeCss(customCss) : null,
        welcomeTitle,
        welcomeTitleAr,
        welcomeMessage,
        welcomeMessageAr,
        footerText,
        footerTextAr,
      },
      create: {
        eventId,
        primaryColor: primaryColor || "#7dc242",
        secondaryColor,
        backgroundColor,
        textColor,
        logoUrl,
        logoWhiteUrl,
        faviconUrl,
        headerImageUrl,
        headerColor,
        ...showLogoUpdate,
        logoHeight,
        customCss: customCss ? sanitizeCss(customCss) : null,
        welcomeTitle,
        welcomeTitleAr,
        welcomeMessage,
        welcomeMessageAr,
        footerText,
        footerTextAr,
      },
    });

    return NextResponse.json(branding);
  } catch (error) {
    console.error("Error saving branding settings:", error);
    return NextResponse.json(
      { error: "Failed to save branding settings" },
      { status: 500 }
    );
  }
}
