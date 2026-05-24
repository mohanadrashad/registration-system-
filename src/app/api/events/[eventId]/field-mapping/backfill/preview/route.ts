import { NextResponse } from "next/server";
import { authorizeEvent } from "@/lib/api-auth";
import { backfillPreviewSchema } from "@/lib/validations/field-mapping";
import { computeBackfillPreview } from "@/lib/services/field-mapping-backfill.service";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

/**
 * Backfill preview — read-only. Computes what a backfill run would
 * change against current Registration.formData blobs, without writing
 * anything. Powers both the preview dialog and the run endpoint's
 * expectedWillUpdate guard (Stage 3b).
 *
 * Requires MANAGER role even though no writes happen — the response
 * includes per-row attendee names + email diffs, which is admin-only
 * info disclosure on equal footing with the destructive run endpoint.
 *
 * Body:
 *   { overwriteNonEmpty: boolean }
 *
 * Response:
 *   {
 *     willUpdate: number,
 *     alreadyCorrect: number,
 *     skipped: number,
 *     diffs: BackfillDiff[],   // capped at 500
 *     diffsTruncated: boolean  // true if more than 500 will-update rows
 *   }
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "manager" });
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json().catch(() => null);
    const parsed = backfillPreviewSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const preview = await computeBackfillPreview(
      eventId,
      parsed.data.overwriteNonEmpty
    );

    return NextResponse.json(preview);
  } catch (error) {
    console.error("Error computing backfill preview:", error);
    return NextResponse.json(
      { error: "Failed to compute backfill preview" },
      { status: 500 }
    );
  }
}
