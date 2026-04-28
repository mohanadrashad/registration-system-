/**
 * Portal session — short-lived signed cookie that lets an authenticated
 * attendee navigate between portal pages without re-submitting their email
 * + confirmation code on every request.
 *
 * Token: a JWT (HMAC-SHA256) signed with AUTH_SECRET, payload tying the
 * cookie to a specific registrationId + eventSlug. Cookie is HttpOnly,
 * SameSite=Lax, Secure in production, default 24-hour lifetime.
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

export const PORTAL_COOKIE_NAME = "portal_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const ISSUER = "registration-system/portal";

export interface PortalSessionPayload extends JWTPayload {
  registrationId: string;
  eventId: string;
  eventSlug: string;
}

function getSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw) {
    throw new Error(
      "AUTH_SECRET env var is required to sign portal session cookies."
    );
  }
  return new TextEncoder().encode(raw);
}

export async function signPortalSession(
  payload: Pick<PortalSessionPayload, "registrationId" | "eventId" | "eventSlug">
): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyPortalSession(
  token: string
): Promise<PortalSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: ISSUER,
    });
    if (
      typeof payload.registrationId !== "string" ||
      typeof payload.eventId !== "string" ||
      typeof payload.eventSlug !== "string"
    ) {
      return null;
    }
    return payload as PortalSessionPayload;
  } catch {
    return null;
  }
}

/**
 * Read the cookie from a NextRequest (used in API route handlers). Returns
 * the verified payload only if the cookie exists, the signature checks out,
 * and the eventSlug in the payload matches the route's eventSlug.
 */
export async function getPortalSessionFromRequest(
  req: NextRequest,
  eventSlug: string
): Promise<PortalSessionPayload | null> {
  const token = req.cookies.get(PORTAL_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyPortalSession(token);
  if (!payload) return null;
  if (payload.eventSlug !== eventSlug) return null;
  return payload;
}

/**
 * Helper for non-API contexts (server components, etc) that have access to
 * Next's cookies() helper instead of a NextRequest.
 */
export async function getPortalSessionFromCookies(
  eventSlug: string
): Promise<PortalSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyPortalSession(token);
  if (!payload) return null;
  if (payload.eventSlug !== eventSlug) return null;
  return payload;
}

const cookieAttributes = (maxAgeSeconds: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: maxAgeSeconds,
});

export function setPortalSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set({
    name: PORTAL_COOKIE_NAME,
    value: token,
    ...cookieAttributes(SESSION_TTL_SECONDS),
  });
}

export function clearPortalSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: PORTAL_COOKIE_NAME,
    value: "",
    ...cookieAttributes(0),
  });
}
