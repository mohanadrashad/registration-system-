import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - Get event capacity
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { capacity: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json({ capacity: event.capacity });
  } catch (error) {
    console.error("Error getting capacity:", error);
    return NextResponse.json(
      { error: "Failed to get capacity" },
      { status: 500 }
    );
  }
}

// POST - Update event capacity
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;
    const body = await request.json();

    const { capacity } = body;

    // Validate capacity (null or positive integer)
    if (capacity !== null && (typeof capacity !== "number" || capacity < 0)) {
      return NextResponse.json(
        { error: "Capacity must be a positive number or null" },
        { status: 400 }
      );
    }

    const event = await prisma.event.update({
      where: { id: eventId },
      data: { capacity },
    });

    return NextResponse.json({ capacity: event.capacity });
  } catch (error) {
    console.error("Error updating capacity:", error);
    return NextResponse.json(
      { error: "Failed to update capacity" },
      { status: 500 }
    );
  }
}
