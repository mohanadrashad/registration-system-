import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { verifyEmailSettings } from "@/lib/services/email-provider.service";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// POST - Verify email settings (test connection and mark as verified)
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "editor", module: "customEmail" });
    if (ctx instanceof NextResponse) return ctx;

    // Get current settings
    const settings = await prisma.eventEmailSettings.findUnique({
      where: { eventId },
    });

    if (!settings) {
      return NextResponse.json(
        { error: "No email settings found" },
        { status: 404 }
      );
    }

    if (settings.provider === "SYSTEM") {
      return NextResponse.json(
        { error: "System email is always verified" },
        { status: 400 }
      );
    }

    // Verify connection
    const result = await verifyEmailSettings(settings);

    if (!result.valid) {
      return NextResponse.json(
        { error: result.error || "Connection verification failed" },
        { status: 400 }
      );
    }

    // Mark as verified
    const updated = await prisma.eventEmailSettings.update({
      where: { eventId },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Email settings verified successfully",
      verifiedAt: updated.verifiedAt,
    });
  } catch (error) {
    console.error("Error verifying email settings:", error);
    return NextResponse.json(
      { error: "Failed to verify email settings" },
      { status: 500 }
    );
  }
}
