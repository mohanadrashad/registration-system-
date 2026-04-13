import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkInService } from "@/lib/services/checkin.service";
import { CheckInMethod } from "@prisma/client";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// POST - Check in a registration
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;
    const body = await request.json();

    if (!body.confirmationCode) {
      return NextResponse.json(
        { error: "confirmationCode is required" },
        { status: 400 }
      );
    }

    const validMethods = Object.values(CheckInMethod);
    const method = body.method || "MANUAL";
    if (!validMethods.includes(method)) {
      return NextResponse.json(
        { error: `Invalid method. Must be one of: ${validMethods.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await checkInService.checkIn({
      eventId,
      confirmationCode: body.confirmationCode,
      method: method as CheckInMethod,
      location: body.location,
      checkInPointId: body.checkInPointId,
      deviceId: body.deviceId,
      checkedInBy: (session.user as { id?: string }).id,
      notes: body.notes,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error,
          alreadyCheckedIn: result.alreadyCheckedIn,
          registration: result.registration
            ? {
                id: result.registration.id,
                contact: result.registration.contact,
              }
            : undefined,
        },
        { status: result.alreadyCheckedIn ? 409 : 404 }
      );
    }

    return NextResponse.json({
      success: true,
      checkIn: result.checkIn,
      registration: {
        id: result.registration!.id,
        confirmationCode: result.registration!.confirmationCode,
        contact: result.registration!.contact,
      },
    });
  } catch (error) {
    console.error("Error checking in:", error);
    return NextResponse.json(
      { error: "Failed to check in" },
      { status: 500 }
    );
  }
}

// GET - Get check-in stats
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;
    const stats = await checkInService.getStats(eventId);

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error getting check-in stats:", error);
    return NextResponse.json(
      { error: "Failed to get stats" },
      { status: 500 }
    );
  }
}
