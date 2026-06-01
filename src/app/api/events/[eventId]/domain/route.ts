import { NextResponse } from "next/server";
import { authorizeEvent } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - Get domain settings for an event
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "authenticated", module: "customDomain" });
    if (ctx instanceof NextResponse) return ctx;

    const domain = await prisma.eventDomain.findUnique({
      where: { eventId },
    });

    return NextResponse.json(domain || {
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
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "editor", module: "customDomain" });
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();
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
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "editor", module: "customDomain" });
    if (ctx instanceof NextResponse) return ctx;

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
