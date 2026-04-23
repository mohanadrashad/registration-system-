import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getDefaultFieldsForEvent } from "@/lib/form-builder";
import { getOrCreateDefaultRegistrationStep } from "@/lib/services/phase.service";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// POST - Seed default fields for an event
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;

    // Check if event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check if fields already exist
    const existingFields = await prisma.formField.count({
      where: { eventId },
    });

    if (existingFields > 0) {
      return NextResponse.json(
        { error: "Event already has form fields. Delete them first to re-seed." },
        { status: 409 }
      );
    }

    // Create default fields, all attached to the event's default
    // registration step (auto-created if missing).
    const defaultFields = getDefaultFieldsForEvent(eventId);
    const step = await getOrCreateDefaultRegistrationStep(eventId);

    await prisma.formField.createMany({
      data: defaultFields.map((f) => ({ ...f, stepId: step.id })),
    });

    // Return created fields
    const fields = await prisma.formField.findMany({
      where: { eventId },
      orderBy: { order: "asc" },
    });

    return NextResponse.json(fields, { status: 201 });
  } catch (error) {
    console.error("Error seeding form fields:", error);
    return NextResponse.json(
      { error: "Failed to seed form fields" },
      { status: 500 }
    );
  }
}
