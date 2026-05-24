import { NextResponse } from "next/server";
import { authorizeEvent } from "@/lib/api-auth";
import {
  backfillRunSchema,
  MAPPING_ERROR_CODES,
} from "@/lib/validations/field-mapping";
import {
  executeBackfillBatches,
  loadBackfillDecisions,
} from "@/lib/services/field-mapping-backfill.service";

interface RouteParams {
  params: Promise<{ eventId: string }>;
}

/**
 * Backfill run — applies the resolved diffs to Contact rows in
 * batches. Always preceded by a preview call (Chunk 3a); the
 * `expectedWillUpdate` from that preview is the stale guard.
 *
 * MANAGER role — destructive write scope.
 *
 * Body:
 *   { overwriteNonEmpty: boolean, expectedWillUpdate: number }
 *
 * Stale guard:
 *   Server re-runs the preview to get the current willUpdate count.
 *   If it doesn't EXACTLY match the client's expectedWillUpdate,
 *   responds 409 BACKFILL_PREVIEW_STALE with the current and
 *   expected counts in the conflict body. UI should re-fetch the
 *   preview and re-confirm with the user.
 *
 * Response (200):
 *   {
 *     updated: number,           // rows successfully written
 *     failed: BackfillFailure[], // rows that errored, with contactName
 *                                 // + contactEmail for attribution
 *     summary: {                 // counts from the just-completed re-run
 *       willUpdate, alreadyCorrect, skipped
 *     },
 *     interruptedAtRow?: number  // present only if outer try/catch
 *                                 // fired (catastrophic batch-loop break)
 *   }
 *
 * Sequence:
 *   1. Auth (MANAGER) + body parse.
 *   2. loadBackfillDecisions — re-run the per-row decision sweep
 *      against current DB state.
 *   3. Compare decisions.willUpdate with body.expectedWillUpdate.
 *      Mismatch → 409.
 *   4. executeBackfillBatches(decisions.diffs) — hybrid fast/slow
 *      batch writer.
 *   5. Return {updated, failed, summary, interruptedAtRow?}.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { eventId } = await params;
    const ctx = await authorizeEvent(eventId, { role: "manager" });
    if (ctx instanceof NextResponse) return ctx;

    const body = await request.json().catch(() => null);
    const parsed = backfillRunSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { overwriteNonEmpty, expectedWillUpdate } = parsed.data;

    // Server-side re-run of the same decision sweep the preview
    // endpoint exposes. The diffs we operate on come from THIS
    // re-run, not the stale snapshot the client sent — so even if
    // the count matches, we still write the freshest values.
    const decisions = await loadBackfillDecisions(eventId, overwriteNonEmpty);

    if (decisions.willUpdate !== expectedWillUpdate) {
      return NextResponse.json(
        {
          error:
            "Preview is stale. Refresh and re-confirm before applying.",
          code: MAPPING_ERROR_CODES.BACKFILL_PREVIEW_STALE,
          conflict: {
            expectedWillUpdate,
            currentWillUpdate: decisions.willUpdate,
          },
        },
        { status: 409 }
      );
    }

    const result = await executeBackfillBatches(decisions.diffs);

    // Spec quality discipline: backfill operations log to console at
    // INFO with event ID, admin user ID, row count, overwrite flag.
    // IDs only — no attendee names or emails in logs (PII boundary).
    console.info(
      `[field-mapping-backfill] eventId=${eventId} ` +
        `adminUserId=${ctx.session.user.id} ` +
        `overwrite=${overwriteNonEmpty} ` +
        `updated=${result.updated} ` +
        `failed=${result.failed.length}` +
        (result.interruptedAtRow !== undefined
          ? ` interruptedAtRow=${result.interruptedAtRow}`
          : "")
    );

    return NextResponse.json({
      updated: result.updated,
      failed: result.failed,
      summary: {
        willUpdate: decisions.willUpdate,
        alreadyCorrect: decisions.alreadyCorrect,
        skipped: decisions.skipped,
      },
      ...(result.interruptedAtRow !== undefined && {
        interruptedAtRow: result.interruptedAtRow,
      }),
    });
  } catch (error) {
    console.error("Error running backfill:", error);
    return NextResponse.json(
      { error: "Failed to run backfill" },
      { status: 500 }
    );
  }
}
