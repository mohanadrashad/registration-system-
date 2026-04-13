import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkInService } from "@/lib/services/checkin.service";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - Search attendees for check-in
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";

    if (!query || query.length < 2) {
      return NextResponse.json([]);
    }

    const results = await checkInService.searchAttendees(eventId, query);

    return NextResponse.json(
      results.map((r) => ({
        id: r.id,
        confirmationCode: r.confirmationCode,
        contact: r.contact,
        isCheckedIn: r.checkIns.length > 0 && !r.checkIns[0].checkOutTime,
        lastCheckIn: r.checkIns[0] || null,
      }))
    );
  } catch (error) {
    console.error("Error searching attendees:", error);
    return NextResponse.json(
      { error: "Failed to search" },
      { status: 500 }
    );
  }
}
