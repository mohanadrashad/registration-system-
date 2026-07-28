import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { EmailProvider, type Prisma } from "@prisma/client";
import {
  testEmailSettings,
  verifyEmailSettings,
} from "@/lib/services/email-provider.service";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - Get email settings for an event
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "authenticated", module: "customEmail" });
    if (ctx instanceof NextResponse) return ctx;

    const settings = await prisma.eventEmailSettings.findUnique({
      where: { eventId },
    });

    if (!settings) {
      // Return default/empty settings
      return NextResponse.json({
        eventId,
        provider: "SYSTEM",
        fromName: process.env.SMTP_FROM_NAME || "Registration System",
        fromEmail: process.env.SMTP_FROM_EMAIL || "",
        isVerified: true, // System is always verified
      });
    }

    // Don't expose sensitive data
    return NextResponse.json({
      ...settings,
      smtpPassword: settings.smtpPassword ? "••••••••" : null,
      apiKey: settings.apiKey ? "••••••••" : null,
    });
  } catch (error) {
    console.error("Error fetching email settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch email settings" },
      { status: 500 }
    );
  }
}

// POST - Create or update email settings
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "editor", module: "customEmail" });
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();

    // Validate provider
    const validProviders = Object.values(EmailProvider);
    if (body.provider && !validProviders.includes(body.provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${validProviders.join(", ")}` },
        { status: 400 }
      );
    }

    // If switching to SYSTEM, just delete custom settings
    if (body.provider === "SYSTEM") {
      await prisma.eventEmailSettings.deleteMany({
        where: { eventId },
      });
      return NextResponse.json({
        eventId,
        provider: "SYSTEM",
        fromName: process.env.SMTP_FROM_NAME || "Registration System",
        fromEmail: process.env.SMTP_FROM_EMAIL || "",
        isVerified: true,
      });
    }

    // Validate required fields for custom providers
    if (!body.fromName || !body.fromEmail) {
      return NextResponse.json(
        { error: "fromName and fromEmail are required" },
        { status: 400 }
      );
    }

    // Provider-specific validation
    if (body.provider === "CUSTOM_SMTP") {
      if (!body.smtpHost || !body.smtpUser || !body.smtpPassword) {
        return NextResponse.json(
          { error: "SMTP host, user, and password are required for custom SMTP" },
          { status: 400 }
        );
      }
    } else if (["RESEND", "SENDGRID", "MAILGUN"].includes(body.provider)) {
      if (!body.apiKey) {
        return NextResponse.json(
          { error: "API key is required for this provider" },
          { status: 400 }
        );
      }
    }

    // Check if settings exist
    const existing = await prisma.eventEmailSettings.findUnique({
      where: { eventId },
    });

    // Prepare data - only update password/apiKey if provided and not masked
    const data: Omit<Prisma.EventEmailSettingsUncheckedCreateInput, "eventId"> = {
      provider: body.provider,
      fromName: body.fromName,
      fromEmail: body.fromEmail,
      replyTo: body.replyTo || null,
      smtpHost: body.smtpHost || null,
      smtpPort: body.smtpPort ? parseInt(body.smtpPort) : null,
      smtpUser: body.smtpUser || null,
      smtpSecure: body.smtpSecure ?? true,
      isVerified: false, // Reset verification when settings change
    };

    // Only update sensitive fields if they're not masked
    if (body.smtpPassword && body.smtpPassword !== "••••••••") {
      data.smtpPassword = body.smtpPassword;
    } else if (existing) {
      data.smtpPassword = existing.smtpPassword;
    }

    if (body.apiKey && body.apiKey !== "••••••••") {
      data.apiKey = body.apiKey;
    } else if (existing) {
      data.apiKey = existing.apiKey;
    }

    const settings = await prisma.eventEmailSettings.upsert({
      where: { eventId },
      update: data,
      create: {
        eventId,
        ...data,
      },
    });

    return NextResponse.json({
      ...settings,
      smtpPassword: settings.smtpPassword ? "••••••••" : null,
      apiKey: settings.apiKey ? "••••••••" : null,
    });
  } catch (error) {
    console.error("Error saving email settings:", error);
    return NextResponse.json(
      { error: "Failed to save email settings" },
      { status: 500 }
    );
  }
}

// DELETE - Remove custom email settings (revert to system)
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "editor", module: "customEmail" });
    if (ctx instanceof NextResponse) return ctx;

    await prisma.eventEmailSettings.deleteMany({
      where: { eventId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting email settings:", error);
    return NextResponse.json(
      { error: "Failed to delete email settings" },
      { status: 500 }
    );
  }
}
