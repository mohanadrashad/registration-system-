/**
 * Tiny in-memory sliding-window rate limiter for the /api/translate endpoint.
 * Keyed by NextAuth session user-id. Allows up to N requests in a rolling
 * one-minute window; the (N+1)th in that window is rejected.
 *
 * Same in-memory caveat as `src/lib/portal/login-rate-limit.ts`: the map
 * doesn't survive restarts and isn't shared across serverless instances. For
 * an admin utility on a hobby-tier deploy that's fine — the goal is to keep
 * a single admin from burning MyMemory's daily quota on a runaway loop, not
 * to provide strict distributed enforcement.
 */

const REQUESTS_PER_MINUTE = 60;
const WINDOW_MS = 60 * 1000;
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;
const MAX_KEYS = 10_000;

const ATTEMPTS = new Map<string, number[]>();
let lastPrune = 0;

function prune(now: number): void {
  if (now - lastPrune < PRUNE_INTERVAL_MS && ATTEMPTS.size < MAX_KEYS) return;
  lastPrune = now;
  const cutoff = now - WINDOW_MS;
  for (const [key, stamps] of ATTEMPTS) {
    const live = stamps.filter((t) => t > cutoff);
    if (live.length === 0) ATTEMPTS.delete(key);
    else ATTEMPTS.set(key, live);
  }
  if (ATTEMPTS.size > MAX_KEYS) {
    // Last-resort overflow guard. Drop the oldest half by insertion order.
    let i = 0;
    for (const key of ATTEMPTS.keys()) {
      ATTEMPTS.delete(key);
      if (++i > MAX_KEYS / 2) break;
    }
  }
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds?: number;
}

/**
 * Record one attempt for this user and return whether it was allowed.
 * The call itself counts toward the limit — there is no separate "check"
 * step.
 */
export function checkTranslateRateLimit(userId: string): RateLimitResult {
  const now = Date.now();
  prune(now);

  const cutoff = now - WINDOW_MS;
  const stamps = (ATTEMPTS.get(userId) ?? []).filter((t) => t > cutoff);

  if (stamps.length >= REQUESTS_PER_MINUTE) {
    const oldest = stamps[0];
    const retryMs = oldest + WINDOW_MS - now;
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)),
    };
  }

  stamps.push(now);
  ATTEMPTS.set(userId, stamps);
  return { ok: true };
}
