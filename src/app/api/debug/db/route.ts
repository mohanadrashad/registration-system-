import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Temporary Stage-3 debug endpoint. Confirms which Neon host this
// deployment is wired to and whether the PhaseOption table has the
// four new Stage-3 columns. Created in response to the QA finding
// that the portal API response was missing the receipt-text fields
// despite the code clearly projecting them.
//
// Originally requested at `src/app/api/__debug/db/route.ts`; Next.js
// drops any path part starting with `_` from the App Router (see
// `next/dist/build/entries.js` — `ignorePartFilter: (part) =>
// part.startsWith('_')`), so the underscore-prefixed path was
// unreachable. The single-segment `debug/db` is reachable and the
// production gate below is what actually keeps it safe.
//
// FOLLOW-UP: delete this whole file before merging Stage 3 to main.

// Force dynamic — we never want a cached snapshot of this.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // Hard production gate. Preview / Development pass through; Production
  // 404s as if the route never existed.
  if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Parse host without password. URL constructor handles postgres://
  // and postgresql:// schemes fine on Node; the catch-block is just in
  // case DATABASE_URL is missing or malformed in some local-dev case.
  const databaseUrl = process.env.DATABASE_URL ?? "";
  let host: string | null = null;
  try {
    host = new URL(databaseUrl).host;
  } catch {
    host = null;
  }

  // Live column read against information_schema. If Preview points at a
  // DB without the Stage-3 columns, the four `receipt*` rows will be
  // absent from the list returned to the caller.
  try {
    const rows = await prisma.$queryRaw<
      Array<{ column_name: string }>
    >`SELECT column_name FROM information_schema.columns WHERE table_name = 'PhaseOption' ORDER BY column_name`;
    return NextResponse.json({
      host,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      phaseOptionColumns: rows.map((r) => r.column_name),
    });
  } catch (e) {
    return NextResponse.json(
      {
        host,
        vercelEnv: process.env.VERCEL_ENV ?? null,
        phaseOptionColumns: null,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
