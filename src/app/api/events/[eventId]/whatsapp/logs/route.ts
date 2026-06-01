import { NextResponse } from "next/server";
import { authorizeEvent } from "@/lib/api-auth";
import { whatsAppService } from "@/lib/services/whatsapp.service";
import { WhatsAppStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

// GET - Get WhatsApp message logs
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "authenticated", module: "whatsApp" });
    if (ctx instanceof NextResponse) return ctx;

    const { searchParams } = new URL(request.url);

    const limit = parseInt(searchParams.get("limit") || "50");
    const status = searchParams.get("status") as WhatsAppStatus | null;

    const logs = await whatsAppService.getLogs(eventId, {
      limit,
      status: status || undefined,
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error("Error getting WhatsApp logs:", error);
    return NextResponse.json(
      { error: "Failed to get WhatsApp logs" },
      { status: 500 }
    );
  }
}
