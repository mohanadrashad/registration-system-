import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  signPortalSession,
  setPortalSessionCookie,
} from "@/lib/portal/session";
import {
  isLoginBlocked,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/portal/login-rate-limit";

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
      { error: "Email and confirmation code are required" },
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
    include: { modules: true },
  });

  if (!event || !event.isActive || !event.modules?.selfServicePortal) {
    // Generic message — don't leak whether the event exists or not.
    return NextResponse.json(
      { error: "Invalid email or confirmation code" },
      { status: 401 }
    );
  }

  const registration = await prisma.registration.findFirst({
    where: {
      eventId: event.id,
      confirmationCode: code,
      contact: { email },
    },
    select: { id: true },
  });

  if (!registration) {
    recordLoginFailure(eventSlug, email);
    // Generic message — don't tell the attacker which half was wrong.
    return NextResponse.json(
      { error: "Invalid email or confirmation code" },
      { status: 401 }
    );
  }

  recordLoginSuccess(eventSlug, email);

  const token = await signPortalSession({
    registrationId: registration.id,
    eventId: event.id,
    eventSlug,
  });

  const res = NextResponse.json({ success: true });
  setPortalSessionCookie(res, token);
  return res;
}
