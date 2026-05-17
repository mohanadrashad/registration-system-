import { NextRequest, NextResponse } from "next/server";
import { authorizeEvent } from "@/lib/api-auth";
import {
  getReceiptForAdmin,
  openReceiptStream,
} from "@/lib/services/receipt.service";

interface RouteParams {
  params: Promise<{ eventId: string; receiptId: string }>;
}

/**
 * Admin stream-through. Same threat model as the portal version —
 * authenticated server endpoint pipes the bytes, no public URLs.
 * Auth: any event member can view (gated by authorizeEvent +
 * postRegPhases module).
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { eventId, receiptId } = await params;

  const auth = await authorizeEvent(eventId, { module: "postRegPhases" });
  if (auth instanceof NextResponse) return auth;

  const receipt = await getReceiptForAdmin(receiptId, eventId);
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  let blob;
  try {
    blob = await openReceiptStream(receipt);
  } catch (e) {
    console.error("[admin receipt stream] blob fetch failed:", e);
    return NextResponse.json(
      { error: "Receipt file is no longer available" },
      { status: 410 }
    );
  }

  const safeName = encodeURIComponent(receipt.originalName);
  return new Response(blob.stream, {
    status: 200,
    headers: {
      "Content-Type": receipt.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${safeName}`,
      "Cache-Control": "private, no-store",
    },
  });
}
