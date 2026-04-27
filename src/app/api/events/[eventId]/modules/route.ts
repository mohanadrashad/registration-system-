import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - Get event modules
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const ctx = await authorize();
    if (ctx instanceof NextResponse) return ctx;

    const { eventId } = await params;

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
    const ctx = await authorize("editor");
    if (ctx instanceof NextResponse) return ctx;

    const { eventId } = await params;

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

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
    const ctx = await authorize("manager");
    if (ctx instanceof NextResponse) return ctx;

    const { eventId } = await params;
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
