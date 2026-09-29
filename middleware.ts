import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Hosts that serve ONLY the attendee-facing surface (registration, portal,
// badge + their APIs); the admin login/dashboard 404 there. Lets us hand
// attendees a clean address while the main domain is under a Safe Browsing
// review — a bare password login page is what the phishing heuristics flag.
// Comma-separated env, e.g. PUBLIC_ONLY_HOSTS=lagloire-events.vercel.app.
// Unset = no effect.
const PUBLIC_ONLY_HOSTS = (process.env.PUBLIC_ONLY_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const PUBLIC_ONLY_PREFIXES = [
  "/register",
  "/portal",
  "/badge",
  "/privacy",
  "/api/register",
  "/api/portal",
  "/api/badges",
];

function isAllowedOnPublicOnlyHost(pathname: string): boolean {
  // Static files from /public and app icons (og-image.png, fonts, …).
  if (/\.[a-z0-9]+$/i.test(pathname)) return true;
  return PUBLIC_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function middleware(req: NextRequest) {
  if (
    PUBLIC_ONLY_HOSTS.includes(req.nextUrl.hostname.toLowerCase()) &&
    !isAllowedOnPublicOnlyHost(req.nextUrl.pathname)
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const token =
    req.cookies.get("authjs.session-token")?.value ||
    req.cookies.get("__Secure-authjs.session-token")?.value;

  const isLoggedIn = !!token;
  const isOnDashboard = req.nextUrl.pathname.startsWith("/dashboard");
  const isOnLogin = req.nextUrl.pathname === "/login";
  const isOnApi = req.nextUrl.pathname.startsWith("/api");
  const isPublic =
    req.nextUrl.pathname.startsWith("/register") ||
    req.nextUrl.pathname.startsWith("/badge");

  if (isPublic || isOnApi) {
    return NextResponse.next();
  }

  if (isOnDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isOnLogin && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads).*)"],
};
