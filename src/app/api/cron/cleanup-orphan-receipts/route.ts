import { NextRequest, NextResponse } from "next/server";
import { cleanupOrphanReceipts } from "@/lib/services/receipt.service";
import { cleanupOrphanRegistrationFiles } from "@/lib/services/registration-file.service";

/**
 * Nightly orphan cleanup. Wired in via vercel.json's cron config at
 * 03:30 UTC. Per Vercel's contract, requests originating from the cron
 * scheduler carry an Authorization header containing the CRON_SECRET
 * env value (set on the project). We verify that here so a public
 * caller can't trigger the job.
 *
 * Runs two passes back-to-back:
 *
 *   1. PhaseReceipt orphans (Phase Selections feature) — rows with no
 *      AttendeeSelection back-ref older than the grace window.
 *
 *   2. RegistrationFile orphans (FILE field feature) — rows with
 *      registrationId IS NULL older than the grace window, i.e.
 *      visitors who uploaded a file but abandoned the registration.
 *
 * Both passes share the same defensive shape: best-effort blob
 * delete, log on failure, still delete the row so the next run
 * doesn't re-scan it forever (if the row delete also fails, the
 * orphan gets re-scanned and re-attempted tomorrow).
 *
 * vercel.json's cron path stays at /api/cron/cleanup-orphan-receipts
 * for backwards compatibility — the route name is historical, not
 * scope-defining.
 *
 * Returns a combined JSON summary that appears in the Vercel cron-
 * execution log.
 */
export async function GET(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  // In production Vercel sends `Authorization: Bearer <CRON_SECRET>`.
  // Reject anything that doesn't match. If CRON_SECRET isn't set
  // (mis-config), fail closed.
  if (!expectedSecret) {
    console.error(
      "[cron] CRON_SECRET is not set; orphan cleanup refusing to run"
    );
    return NextResponse.json(
      { error: "Cron not configured" },
      { status: 500 }
    );
  }
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Run both passes in sequence. We deliberately don't Promise.all
  // these — they're independent but a serial run keeps DB load
  // predictable and the log output deterministic for debugging.
  // Failures in one pass shouldn't block the other; wrap each so the
  // other still runs.
  let receipts;
  try {
    receipts = await cleanupOrphanReceipts();
  } catch (err) {
    console.error("[cron] receipt cleanup failed:", err);
    receipts = { error: (err as Error).message };
  }

  let files;
  try {
    files = await cleanupOrphanRegistrationFiles();
  } catch (err) {
    console.error("[cron] registration-file cleanup failed:", err);
    files = { error: (err as Error).message };
  }

  const result = { receipts, files };
  console.log("[cron] orphan-cleanup result:", result);
  return NextResponse.json(result);
}
