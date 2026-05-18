import { NextRequest, NextResponse } from "next/server";
import { cleanupOrphanReceipts } from "@/lib/services/receipt.service";

/**
 * Nightly orphan receipt cleanup. Wired in via vercel.json's cron
 * config. Per Vercel's contract, requests originating from the cron
 * scheduler carry an Authorization header containing the CRON_SECRET
 * env value (set on the project). We verify that here so a public
 * caller can't trigger the job.
 *
 * Returns a JSON summary that appears in the Vercel cron-execution
 * log. No body parameters — the schedule is fixed at the project
 * level.
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

  const result = await cleanupOrphanReceipts();
  console.log("[cron] orphan-cleanup result:", result);
  return NextResponse.json(result);
}
