import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkInService } from "@/lib/services/checkin.service";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - Get recent check-ins
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");

    const checkIns = await checkInService.getRecentCheckIns(eventId, limit);

    return NextResponse.json(
      checkIns.map((c) => ({
        id: c.id,
        checkInTime: c.checkInTime,
        checkOutTime: c.checkOutTime,
        method: c.method,
        location: c.location,
        contact: c.registration.contact,
        confirmationCode: c.registration.confirmationCode,
      }))
    );
  } catch (error) {
    console.error("Error getting recent check-ins:", error);
    return NextResponse.json(
      { error: "Failed to get recent check-ins" },
      { status: 500 }
    );
  }
}
