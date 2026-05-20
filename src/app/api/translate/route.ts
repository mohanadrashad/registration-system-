import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { translate } from "@/lib/services/translation.service";
import { translateRequestSchema } from "@/lib/validations/translate";
import { checkTranslateRateLimit } from "@/lib/translate-rate-limit";

/**
 * POST /api/translate
 *   Body:    { strings: string[], from: "en"|"ar", to: "en"|"ar" }
 *   Returns: { results: TranslateResult[] }
 *
 * Admin-only — any authenticated dashboard user qualifies. This route is
 * NOT event-scoped, so it goes through `auth()` directly rather than
 * `authorizeEvent`. Per-user rate limit: 60 calls/minute.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkTranslateRateLimit(session.user.id);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error:
          "Too many translation requests. Please slow down and try again in a moment.",
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      {
        status: 429,
        headers: limit.retryAfterSeconds
          ? { "Retry-After": String(limit.retryAfterSeconds) }
          : undefined,
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = translateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const results = await translate(parsed.data);
  return NextResponse.json({ results });
}
