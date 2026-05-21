/**
 * reg_upload_session cookie — visitor-bound session for unauthenticated
 * file uploads on the public registration page.
 *
 * The public registration page has no user session (visitors aren't
 * logged in). FILE field uploads still need to be attributable to a
 * specific browsing session so that:
 *   - the upload-token route can validate the visitor "owns" the
 *     pre-submission file before minting a Vercel Blob token;
 *   - the DELETE-file route can confirm the same visitor is the one
 *     trying to replace/remove their own upload;
 *   - the nightly orphan cleanup can scope abandoned files to the
 *     correct visitor without conflating them with concurrent uploads
 *     from other browsers.
 *
 * Mechanism: signed UUID. Server generates a v4 UUID, computes an
 * HMAC-SHA256 of the UUID keyed on AUTH_SECRET, and joins them with
 * "." into the cookie value. Reading the cookie verifies the HMAC in
 * constant time; tampered cookies produce a null UUID and the route
 * mints a fresh session.
 *
 * Mirrors the signing primitive in src/lib/portal/otp.service.ts
 * (createHmac("sha256", AUTH_SECRET)). No new dependencies.
 */

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import type { NextRequest, NextResponse } from "next/server";

export const REG_UPLOAD_SESSION_COOKIE = "reg_upload_session";

// 24 hours, in seconds, for the Max-Age attribute.
const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is required to sign reg_upload_session cookies."
    );
  }
  return secret;
}

function sign(sessionId: string): string {
  return createHmac("sha256", getSecret()).update(sessionId).digest("hex");
}

/**
 * Verify a raw cookie value. Returns the embedded session UUID on a
 * valid signature, or null if missing / malformed / tampered.
 *
 * Performs a timing-safe HMAC comparison so an attacker can't recover
 * the secret one byte at a time via response-time analysis. (Realistic
 * threat? Low — this is a session cookie, not a credential — but
 * matching the OTP service's discipline costs nothing.)
 */
export function verifyUploadSessionCookie(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const idx = raw.indexOf(".");
  if (idx < 1 || idx === raw.length - 1) return null;
  const sessionId = raw.slice(0, idx);
  const providedMac = raw.slice(idx + 1);
  // Format guard before hashing — reject anything that's not a plain
  // ASCII string of bounded length. Avoids unexpected work on garbage.
  if (sessionId.length > 64 || providedMac.length !== 64) return null;
  if (!/^[0-9a-f-]+$/i.test(sessionId) || !/^[0-9a-f]+$/i.test(providedMac)) {
    return null;
  }
  const expected = sign(sessionId);
  // Buffers must be equal length for timingSafeEqual.
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(providedMac, "hex");
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? sessionId : null;
}

/**
 * Read the current reg_upload_session from a request. Returns the
 * embedded session UUID on a valid cookie, null otherwise. Does not
 * mutate state — call sites that need to ensure a session exists
 * should use `getOrCreateUploadSessionId` against the response.
 */
export function readUploadSessionId(request: NextRequest): string | null {
  const raw = request.cookies.get(REG_UPLOAD_SESSION_COOKIE)?.value;
  return verifyUploadSessionCookie(raw);
}

/**
 * Attach a signed reg_upload_session cookie to the response. Cookie is
 * HttpOnly + SameSite=Strict + Secure-in-prod + 24h Max-Age. Path is
 * scoped narrow enough to cover all per-event registration endpoints
 * but doesn't leak to unrelated routes.
 */
export function setUploadSessionCookie(
  response: NextResponse,
  sessionId: string
): void {
  const value = `${sessionId}.${sign(sessionId)}`;
  response.cookies.set({
    name: REG_UPLOAD_SESSION_COOKIE,
    value,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * Read the existing reg_upload_session if valid, otherwise mint a new
 * UUID, sign it, attach the cookie to the response, and return the
 * new session ID. Called once per public-registration GET so the
 * visitor is guaranteed to have a session before they reach the file
 * picker.
 *
 * Idempotent across re-loads: the same browser keeps the same session
 * ID for the cookie's lifetime, so a refresh doesn't orphan an
 * in-flight upload session.
 */
export function getOrCreateUploadSessionId(
  request: NextRequest,
  response: NextResponse
): string {
  const existing = readUploadSessionId(request);
  if (existing) return existing;
  const fresh = randomUUID();
  setUploadSessionCookie(response, fresh);
  return fresh;
}
