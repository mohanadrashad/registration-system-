import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isLoginBlocked,
  isOtpRequestThrottled,
  recordLoginFailure,
  recordOtpRequest,
} from "@/lib/portal/login-rate-limit";
import { requestOtpForEvent } from "@/lib/portal/otp.service";

interface RouteParams {
  params: Promise<{ eventSlug: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { eventSlug } = await params;

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  // Throttle by (event, email) to stop someone from spamming the inbox.
  // The rate limiter is shared with the old login endpoint — reusing it
  // means too many wrong codes also burn into the same lockout.
  const blocked = isLoginBlocked(eventSlug, email);
  if (blocked.blocked) {
    return NextResponse.json(
      {
        error: `Too many attempts. Try again in ${blocked.retryAfterSeconds} seconds.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(blocked.retryAfterSeconds) },
      }
    );
  }

  // Request throttle — counted for EVERY well-formed request (registered
  // email or not, so the 429 carries no enumeration signal). Without it,
  // successful code requests were unmetered: anyone knowing a registered
  // email could bomb that inbox with OTP emails.
  const throttle = isOtpRequestThrottled(eventSlug, email);
  if (throttle.throttled) {
    return NextResponse.json(
      {
        error: `Please wait ${throttle.retryAfterSeconds} seconds before requesting another code.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(throttle.retryAfterSeconds) },
      }
    );
  }
  recordOtpRequest(eventSlug, email);

  // Look up event WITH its modules — but never reveal whether the event
  // exists or whether the email is registered. We always return success.
  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    select: { id: true, isActive: true, modules: { select: { selfServicePortal: true } } },
  });

  if (event && event.isActive && event.modules?.selfServicePortal) {
    const result = await requestOtpForEvent(event.id, email);
    if (!result.generated) {
      // Email didn't match any registration — count as a soft failure for
      // rate-limiting so an attacker can't probe addresses indefinitely.
      recordLoginFailure(eventSlug, email);
    }
  } else {
    recordLoginFailure(eventSlug, email);
  }

  // Always return success to keep email enumeration out of reach.
  return NextResponse.json({
    success: true,
    message: `If a registration exists for that email, we've sent a 6-digit code. It expires in 10 minutes.`,
  });
}
