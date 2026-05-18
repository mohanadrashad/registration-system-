import { NextRequest, NextResponse } from "next/server";
import { authorizeEvent, apiError } from "@/lib/api-auth";
import { clearSelectionForAdmin } from "@/lib/services/selection.service";
import { deleteBlob } from "@/lib/blob";

interface RouteParams {
  params: Promise<{
    eventId: string;
    contactId: string;
    selId: string;
  }>;
}

/**
 * Admin clear of a single AttendeeSelection row. If the selection
 * has a linked receipt, the receipt's blob is also deleted (best-
 * effort, post-commit) and the PhaseReceipt row removed. Cascade
 * direction on AttendeeSelection→PhaseReceipt is SetNull, so the
 * row delete here doesn't cascade-delete the receipt automatically.
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { eventId, selId } = await params;
  const auth = await authorizeEvent(eventId, {
    role: "editor",
    module: "postRegPhases",
  });
  if (auth instanceof NextResponse) return auth;

  try {
    const { deletedBlobPath } = await clearSelectionForAdmin(selId, eventId);
    // Post-commit best-effort blob delete.
    if (deletedBlobPath) {
      try {
        await deleteBlob(deletedBlobPath);
      } catch (err) {
        console.warn(
          "[admin clear selection] blob delete failed:",
          deletedBlobPath,
          err
        );
        // Orphan cleanup picks it up at 24h.
      }
    }
    return NextResponse.json({
      success: true,
      blobDeleted: !!deletedBlobPath,
    });
  } catch (e) {
    if ((e as Error).message === "Selection not found") {
      return apiError("Selection not found", 404);
    }
    if (
      (e as Error).message === "Selection doesn't belong to this event"
    ) {
      return apiError("Selection not found on this event", 404);
    }
    console.error("[admin clear selection] unexpected:", e);
    return apiError("Delete failed. Please try again.", 500);
  }
}
