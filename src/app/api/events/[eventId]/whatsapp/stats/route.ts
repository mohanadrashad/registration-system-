import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { whatsAppService } from "@/lib/services/whatsapp.service";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - Get WhatsApp statistics
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { eventId } = await params;
    const stats = await whatsAppService.getStats(eventId);

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error getting WhatsApp stats:", error);
    return NextResponse.json(
      { error: "Failed to get WhatsApp stats" },
      { status: 500 }
    );
  }
}
