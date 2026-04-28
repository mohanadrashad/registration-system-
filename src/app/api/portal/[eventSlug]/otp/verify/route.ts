import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isLoginBlocked,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/portal/login-rate-limit";
import { verifyOtpForEvent } from "@/lib/portal/otp.service";
import {
  setPortalSessionCookie,
  signPortalSession,
} from "@/lib/portal/session";

interface RouteParams {
  params: Promise<{ eventSlug: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { eventSlug } = await params;

  let body: { email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const code = (body.code || "").trim();

  if (!email || !code) {
    return NextResponse.json(
      { error: "Email and code are required." },
      { status: 400 }
    );
  }

  const blocked = isLoginBlocked(eventSlug, email);
  if (blocked.blocked) {
    return NextResponse.json(
      {
        error: `Too many failed attempts. Try again in ${blocked.retryAfterSeconds} seconds.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(blocked.retryAfterSeconds) },
      }
    );
  }

  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    select: { id: true, isActive: true, modules: { select: { selfServicePortal: true } } },
  });

  if (!event || !event.isActive || !event.modules?.selfServicePortal) {
    recordLoginFailure(eventSlug, email);
    return NextResponse.json(
      { error: "Invalid code or it has expired." },
      { status: 401 }
    );
  }

  const result = await verifyOtpForEvent(event.id, email, code);
  if (!result.ok) {
    recordLoginFailure(eventSlug, email);
    if (result.reason === "expired") {
      return NextResponse.json(
        {
          error:
            "That code has expired. Please request a new one.",
        },
        { status: 401 }
      );
    }
    if (result.reason === "exhausted") {
      return NextResponse.json(
        {
          error:
            "Too many wrong attempts on this code. Please request a new one.",
        },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "Invalid code or it has expired." },
      { status: 401 }
    );
  }

  recordLoginSuccess(eventSlug, email);

  const token = await signPortalSession({
    registrationId: result.registrationId,
    eventId: event.id,
    eventSlug,
  });
  const res = NextResponse.json({ success: true });
  setPortalSessionCookie(res, token);
  return res;
}
