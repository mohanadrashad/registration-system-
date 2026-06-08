import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - Get event modules
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId);
    if (ctx instanceof NextResponse) return ctx;

    const modules = await prisma.eventModules.findUnique({
      where: { eventId },
    });

    if (!modules) {
      return NextResponse.json({ error: "Modules not found" }, { status: 404 });
    }

    return NextResponse.json(modules);
  } catch (error) {
    console.error("Error fetching modules:", error);
    return NextResponse.json(
      { error: "Failed to fetch modules" },
      { status: 500 }
    );
  }
}

// POST - Create default modules for an event
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "editor" });
    if (ctx instanceof NextResponse) return ctx;

    // authorizeEvent already loaded + 404'd a missing event, so the
    // standalone existence findUnique here was redundant — dropped.

    // Check if modules already exist
    const existing = await prisma.eventModules.findUnique({
      where: { eventId },
    });

    if (existing) {
      return NextResponse.json(existing);
    }

    // Create default modules
    const modules = await prisma.eventModules.create({
      data: { eventId },
    });

    return NextResponse.json(modules, { status: 201 });
  } catch (error) {
    console.error("Error creating modules:", error);
    return NextResponse.json(
      { error: "Failed to create modules" },
      { status: 500 }
    );
  }
}

// PATCH - Update module states
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "manager" });
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json();

    // Validate that only allowed fields are being updated
    const allowedFields = [
      "formBuilder",
      "checkIn",
      "whatsApp",
      "sessions",
      "payments",
      "selfServicePortal",
      "approvalWorkflow",
      "waitlist",
      "multiLanguage",
      "customDomain",
      "customEmail",
      "webhooks",
      "postRegPhases",
    ];

    const updates: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(body)) {
      if (allowedFields.includes(key) && typeof value === "boolean") {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Update or create modules
    const modules = await prisma.eventModules.upsert({
      where: { eventId },
      update: updates,
      create: {
        eventId,
        ...updates,
      },
    });

    return NextResponse.json(modules);
  } catch (error) {
    console.error("Error updating modules:", error);
    return NextResponse.json(
      { error: "Failed to update modules" },
      { status: 500 }
    );
  }
}
