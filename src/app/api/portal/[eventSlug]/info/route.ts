import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sanitizeCss } from "@/lib/security/sanitize-css";

interface RouteParams {
  params: Promise<{ eventSlug: string }>;
}

/**
 * Public, unauthenticated endpoint that returns just enough information to
 * render the portal login page with the event's branding (logo, colors,
 * custom CSS, name). Never returns sensitive data.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { eventSlug } = await params;

  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    select: {
      name: true,
      isActive: true,
      modules: {
        select: { selfServicePortal: true, multiLanguage: true },
      },
      branding: true,
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

  return NextResponse.json({
    name: event.name,
    multiLanguage: event.modules?.multiLanguage ?? false,
    branding: event.branding
      ? {
          primaryColor: event.branding.primaryColor,
          secondaryColor: event.branding.secondaryColor,
          backgroundColor: event.branding.backgroundColor,
          textColor: event.branding.textColor,
          logoUrl: event.branding.logoUrl,
          welcomeTitle: event.branding.welcomeTitle,
          welcomeTitleAr: event.branding.welcomeTitleAr,
          welcomeMessage: event.branding.welcomeMessage,
          welcomeMessageAr: event.branding.welcomeMessageAr,
          customCss: sanitizeCss(event.branding.customCss),
        }
      : null,
  });
}
