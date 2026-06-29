import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { authorizeEvent } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { sanitizeCss } from "@/lib/security/sanitize-css";
import { brandingUpdateSchema } from "@/lib/validations/branding";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// A URL we uploaded into the branding-public Vercel Blob store (vs. a pasted
// external URL like imgur, which we must never delete). Vercel public blobs
// live on `*.public.blob.vercel-storage.com`.
function isPublicBlobUrl(url: string | null | undefined): url is string {
  return (
    typeof url === "string" &&
    url.includes(".public.blob.vercel-storage.com/")
  );
}

// GET - Get branding settings for an event
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;

    // authorizeEvent loads the event (404s if missing) and enforces per-event
    // membership — replaces the old global authorize() + manual findUnique.
    const ctx = await authorizeEvent(eventId, { role: "authenticated" });
    if (ctx instanceof NextResponse) return ctx;

    const branding = await prisma.eventBranding.findUnique({
      where: { eventId },
    });

    // Return branding or defaults
    return NextResponse.json(branding || {
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
    const { eventId } = await params;

    // authorizeEvent enforces per-event editor membership AND guarantees the
    // event exists (404s otherwise) — drops the old global authorize("editor")
    // plus the redundant event.findUnique existence check.
    const ctx = await authorizeEvent(eventId, { role: "editor" });
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();

    const parsed = brandingUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid branding settings", details: parsed.error.flatten() },
        { status: 400 }
      );
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

    // Snapshot the current image URLs so we can delete any blob that this save
    // replaces (reconcile-on-replace — see below).
    const existing = await prisma.eventBranding.findUnique({
      where: { eventId },
      select: { logoUrl: true, logoWhiteUrl: true, faviconUrl: true },
    });

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

    // Reconcile-on-replace: when an uploaded image is replaced with a
    // different one, delete the now-orphaned blob from the branding-public
    // store. Best-effort — a failed delete must never fail the save. Only our
    // own public-store blobs are touched (pasted external URLs are left
    // alone). This does NOT cover abandoned uploads (uploaded then never
    // saved) — those are a deliberately-unswept KB-scale orphan, not worth a
    // cron's deletion footgun.
    const blobToken = process.env.BLOB_PUBLIC_READ_WRITE_TOKEN;
    if (blobToken && existing) {
      const orphans = (
        [
          [existing.logoUrl, branding.logoUrl],
          [existing.logoWhiteUrl, branding.logoWhiteUrl],
          [existing.faviconUrl, branding.faviconUrl],
        ] as const
      )
        .filter(([oldUrl, newUrl]) => isPublicBlobUrl(oldUrl) && oldUrl !== newUrl)
        .map(([oldUrl]) => oldUrl as string);
      if (orphans.length > 0) {
        try {
          await del(orphans, { token: blobToken });
        } catch (e) {
          console.error("[branding] orphan blob cleanup failed:", e);
        }
      }
    }

    return NextResponse.json(branding);
  } catch (error) {
    console.error("Error saving branding settings:", error);
    return NextResponse.json(
      { error: "Failed to save branding settings" },
      { status: 500 }
    );
  }
}
