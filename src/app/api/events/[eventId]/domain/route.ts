import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - Get domain settings for an event
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        domain: true,
        modules: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check if custom domain module is enabled
    if (!event.modules?.customDomain) {
      return NextResponse.json(
        { error: "Custom domain module is not enabled for this event" },
        { status: 403 }
      );
    }

    return NextResponse.json(event.domain || {
      customDomain: null,
      isVerified: false,
      verificationRecord: null,
    });
  } catch (error) {
    console.error("Error getting domain settings:", error);
    return NextResponse.json(
      { error: "Failed to get domain settings" },
      { status: 500 }
    );
  }
}

// POST - Create or update domain settings
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

    if (!event.modules?.customDomain) {
      return NextResponse.json(
        { error: "Custom domain module is not enabled for this event" },
        { status: 403 }
      );
    }

    const { customDomain } = body;

    // If domain changed, reset verification
    const existingDomain = await prisma.eventDomain.findUnique({
      where: { eventId },
    });

    const domainChanged = existingDomain?.customDomain !== customDomain;

    // Generate verification record if domain changed or doesn't exist
    const verificationRecord = domainChanged || !existingDomain
      ? `regsys-verify=${crypto.randomBytes(16).toString("hex")}`
      : existingDomain.verificationRecord;

    const domain = await prisma.eventDomain.upsert({
      where: { eventId },
      update: {
        customDomain,
        isVerified: domainChanged ? false : existingDomain?.isVerified,
        verifiedAt: domainChanged ? null : existingDomain?.verifiedAt,
        verificationRecord,
      },
      create: {
        eventId,
        customDomain,
        isVerified: false,
        verificationRecord,
      },
    });

    return NextResponse.json(domain);
  } catch (error) {
    console.error("Error saving domain settings:", error);
    return NextResponse.json(
      { error: "Failed to save domain settings" },
      { status: 500 }
    );
  }
}

// DELETE - Remove custom domain for an event
export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;

    const existing = await prisma.eventDomain.findUnique({
      where: { eventId },
    });

    if (existing) {
      await prisma.eventDomain.delete({ where: { eventId } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting domain:", error);
    return NextResponse.json(
      { error: "Failed to delete domain" },
      { status: 500 }
    );
  }
}
