/**
 * Tiny in-memory rate limiter for portal login attempts. Keyed by
 * (eventSlug, normalised email). After N consecutive failures, blocks
 * further attempts for a cool-off window. Successful login clears the
 * counter.
 *
 * In-memory means it doesn't survive server restarts and isn't shared
 * across Vercel's serverless instances — but for a hobby-tier deploy
 * it's better than nothing, and adds friction to brute-force attempts
 * on the per-event email+code login. For multi-instance prod we'd swap
 * this for a Redis-backed limiter; the API stays the same.
 */

interface AttemptRecord {
  failures: number;
  blockedUntil: number; // epoch ms; 0 = not currently blocked
}

const ATTEMPTS = new Map<string, AttemptRecord>();
const MAX_FAILURES = 5;
const BLOCK_MS = 60 * 1000; // 1 minute lockout
const ATTEMPT_TTL_MS = 15 * 60 * 1000; // forget the record after 15 min

function key(eventSlug: string, email: string): string {
  return `${eventSlug}::${email.toLowerCase().trim()}`;
}

function prune(): void {
  // Drop records that haven't been touched in a while so the map can't
  // grow unboundedly on a long-lived process.
  const now = Date.now();
  for (const [k, rec] of ATTEMPTS) {
    if (rec.blockedUntil > now) continue;
    if (rec.failures === 0) ATTEMPTS.delete(k);
  }
  if (ATTEMPTS.size > 10_000) {
    // Last-resort: clear half on overflow.
    let i = 0;
    for (const k of ATTEMPTS.keys()) {
      ATTEMPTS.delete(k);
      if (++i > 5_000) break;
    }
  }
  // Forget records older than the TTL by checking blockedUntil staleness.
  for (const [k, rec] of ATTEMPTS) {
    if (rec.blockedUntil > 0 && now - rec.blockedUntil > ATTEMPT_TTL_MS) {
      ATTEMPTS.delete(k);
    }
  }
}

export function isLoginBlocked(
  eventSlug: string,
  email: string
): { blocked: true; retryAfterSeconds: number } | { blocked: false } {
  prune();
  const rec = ATTEMPTS.get(key(eventSlug, email));
  if (!rec) return { blocked: false };
  const now = Date.now();
  if (rec.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil((rec.blockedUntil - now) / 1000),
    };
  }
  return { blocked: false };
}

export function recordLoginFailure(eventSlug: string, email: string): void {
  const k = key(eventSlug, email);
  const rec = ATTEMPTS.get(k) ?? { failures: 0, blockedUntil: 0 };
  rec.failures += 1;
  if (rec.failures >= MAX_FAILURES) {
    rec.blockedUntil = Date.now() + BLOCK_MS;
    rec.failures = 0; // reset counter once blocked
  }
  ATTEMPTS.set(k, rec);
}

export function recordLoginSuccess(eventSlug: string, email: string): void {
  ATTEMPTS.delete(key(eventSlug, email));
}

/**
 * OTP-request throttle, separate from the failure-based lockout above.
 *
 * The failure limiter only counts misses — a *successful* code request was
 * unmetered, so anyone who knew a registered email could trigger unlimited
 * OTP emails to that inbox (email bombing) while also invalidating the
 * victim's previous codes on every request. This throttle is recorded for
 * EVERY well-formed request, registered or not, so a 429 reveals nothing
 * about whether the address exists.
 *
 * Limits: a short cooldown between consecutive requests, plus a cap per
 * rolling window. Same in-memory caveats as the failure limiter above.
 */
interface SendRecord {
  windowStart: number; // epoch ms of the first request in the current window
  count: number;
  lastRequestAt: number;
}

const OTP_REQUESTS = new Map<string, SendRecord>();
const OTP_SEND_COOLDOWN_MS = 30 * 1000; // min gap between requests
const OTP_SEND_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_SENDS_PER_WINDOW = 5;

export function isOtpRequestThrottled(
  eventSlug: string,
  email: string
): { throttled: true; retryAfterSeconds: number } | { throttled: false } {
  const now = Date.now();
  // Same unbounded-growth guard as the failure limiter.
  if (OTP_REQUESTS.size > 10_000) {
    for (const [k, rec] of OTP_REQUESTS) {
      if (now - rec.windowStart > OTP_SEND_WINDOW_MS) OTP_REQUESTS.delete(k);
    }
  }
  const rec = OTP_REQUESTS.get(key(eventSlug, email));
  if (!rec) return { throttled: false };

  if (now - rec.lastRequestAt < OTP_SEND_COOLDOWN_MS) {
    return {
      throttled: true,
      retryAfterSeconds: Math.ceil(
        (OTP_SEND_COOLDOWN_MS - (now - rec.lastRequestAt)) / 1000
      ),
    };
  }
  if (
    now - rec.windowStart < OTP_SEND_WINDOW_MS &&
    rec.count >= OTP_MAX_SENDS_PER_WINDOW
  ) {
    return {
      throttled: true,
      retryAfterSeconds: Math.ceil(
        (OTP_SEND_WINDOW_MS - (now - rec.windowStart)) / 1000
      ),
    };
  }
  return { throttled: false };
}

export function recordOtpRequest(eventSlug: string, email: string): void {
  const k = key(eventSlug, email);
  const now = Date.now();
  const rec = OTP_REQUESTS.get(k);
  if (!rec || now - rec.windowStart >= OTP_SEND_WINDOW_MS) {
    OTP_REQUESTS.set(k, { windowStart: now, count: 1, lastRequestAt: now });
    return;
  }
  rec.count += 1;
  rec.lastRequestAt = now;
}
