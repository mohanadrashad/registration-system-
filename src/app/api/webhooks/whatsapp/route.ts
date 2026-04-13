import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { whatsAppService } from "@/lib/services/whatsapp.service";
import { WhatsAppStatus } from "@prisma/client";

/**
 * WhatsApp Webhook Handler for Meta Business API
 *
 * This endpoint handles:
 * 1. Webhook verification (GET request from Meta)
 * 2. Status updates for sent messages (POST request)
 * 3. Incoming messages (POST request) - not implemented yet
 */

// GET - Webhook verification
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    // Check if this is a verification request
    if (mode !== "subscribe") {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }

    if (!token || !challenge) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    // Find event with matching webhook verify token
    const settings = await prisma.eventWhatsAppSettings.findFirst({
      where: { webhookVerifyToken: token },
    });

    if (!settings) {
      console.error("WhatsApp webhook verification failed: Invalid token");
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    // Return the challenge to verify
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("WhatsApp webhook verification error:", error);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 }
    );
  }
}

// POST - Receive webhook events
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Meta webhook structure
    // {
    //   "object": "whatsapp_business_account",
    //   "entry": [{
    //     "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
    //     "changes": [{
    //       "value": {
    //         "messaging_product": "whatsapp",
    //         "metadata": { "phone_number_id": "...", "display_phone_number": "..." },
    //         "statuses": [{ ... }],
    //         "messages": [{ ... }]
    //       },
    //       "field": "messages"
    //     }]
    //   }]
    // }

    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ status: "ignored" });
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;

        const value = change.value;

        // Handle status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            await handleStatusUpdate(status);
          }
        }

        // Handle incoming messages (future implementation)
        // if (value.messages) {
        //   for (const message of value.messages) {
        //     await handleIncomingMessage(message);
        //   }
        // }
      }
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ status: "received" });
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    // Still return 200 to prevent Meta from retrying
    return NextResponse.json({ status: "error" });
  }
}

// Handle message status updates
async function handleStatusUpdate(status: {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  errors?: { code: number; title: string }[];
}) {
  try {
    const { id: messageId, status: statusValue, timestamp } = status;

    // Map Meta status to our enum
    const statusMap: Record<string, WhatsAppStatus> = {
      sent: "SENT",
      delivered: "DELIVERED",
      read: "READ",
      failed: "FAILED",
    };

    const mappedStatus = statusMap[statusValue];
    if (!mappedStatus) {
      console.log(`Unknown WhatsApp status: ${statusValue}`);
      return;
    }

    // Convert timestamp to Date
    const timestampDate = timestamp ? new Date(parseInt(timestamp) * 1000) : undefined;

    await whatsAppService.updateMessageStatus(messageId, mappedStatus, timestampDate);

    // If failed, log the error
    if (statusValue === "failed" && status.errors?.length) {
      const errorMsg = status.errors.map(e => `${e.code}: ${e.title}`).join(", ");
      console.error(`WhatsApp message ${messageId} failed:`, errorMsg);

      // Update error message in log
      await prisma.whatsAppLog.updateMany({
        where: { messageId },
        data: { errorMessage: errorMsg },
      });
    }
  } catch (error) {
    console.error("Error handling WhatsApp status update:", error);
  }
}
