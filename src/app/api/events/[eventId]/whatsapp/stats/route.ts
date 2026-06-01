import { NextResponse } from "next/server";
import { authorizeEvent } from "@/lib/api-auth";
import { whatsAppService } from "@/lib/services/whatsapp.service";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - Get WhatsApp statistics
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "authenticated", module: "whatsApp" });
    if (ctx instanceof NextResponse) return ctx;

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
