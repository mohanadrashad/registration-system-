import { NextRequest, NextResponse } from "next/server";
import { runPhaseReminders } from "@/lib/services/phase-reminder.service";

// Vercel Cron entrypoint. Schedule lives in vercel.json (every 15 min).
//
// Auth: Vercel automatically attaches `Authorization: Bearer ${CRON_SECRET}`
// when CRON_SECRET is set as an env var. We reject any other caller so this
// can't be used to spam reminders by hitting the URL directly.
//
// In dev (no CRON_SECRET configured) we fall back to allowing the call so
// developers can hit the route from a browser to trigger a run manually.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const header = req.headers.get("authorization");
    if (header !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runPhaseReminders();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[cron/phase-reminders] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cron failed" },
      { status: 500 }
    );
  }
}
