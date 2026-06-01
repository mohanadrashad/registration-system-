import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { testEmailSettings } from "@/lib/services/email-provider.service";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// POST - Send a test email
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "editor", module: "customEmail" });
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();

    if (!body.testEmail) {
      return NextResponse.json(
        { error: "testEmail is required" },
        { status: 400 }
      );
    }

    // Get current settings
    const settings = await prisma.eventEmailSettings.findUnique({
      where: { eventId },
    });

    if (!settings) {
      return NextResponse.json(
        { error: "No email settings found. Save settings first." },
        { status: 404 }
      );
    }

    if (settings.provider === "SYSTEM") {
      return NextResponse.json(
        { error: "Cannot test system email settings from here" },
        { status: 400 }
      );
    }

    // Send test email
    const result = await testEmailSettings(settings, body.testEmail);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Test email sent to ${body.testEmail}`,
        messageId: result.messageId,
      });
    } else {
      return NextResponse.json(
        { error: result.error || "Failed to send test email" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error sending test email:", error);
    return NextResponse.json(
      { error: "Failed to send test email" },
      { status: 500 }
    );
  }
}
