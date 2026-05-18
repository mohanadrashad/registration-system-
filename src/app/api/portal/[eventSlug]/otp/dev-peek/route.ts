import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueDevOtpForEvent } from "@/lib/portal/otp.service";

interface RouteParams {
  params: Promise<{ eventSlug: string }>;
}

/**
 * Staging-only debug endpoint. Generates a fresh portal OTP for the
 * given email's registration and returns the plain code, bypassing
 * the email send. Lets a developer log into the portal when staging
 * email infrastructure is unreliable.
 *
 * Two gates, both required (fails closed if either is missing):
 *
 *   1. Runtime environment is not production.
 *      We check VERCEL_ENV first because Vercel sets NODE_ENV to
 *      "production" on Preview deployments too — using NODE_ENV alone
 *      would block Preview, which is the opposite of what we want.
 *      Falls back to NODE_ENV for non-Vercel hosts (local dev,
 *      self-hosted), where VERCEL_ENV is undefined.
 *
 *   2. DEV_OTP_PEEK_ENABLED === "true". Explicit opt-in env var. Only
 *      set in the Vercel Preview environment — never in Production.
 *
 * The two gates are belt and suspenders: the runtime check stops a
 * misconfigured Production deployment from accepting the request even
 * if someone accidentally sets DEV_OTP_PEEK_ENABLED there.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const runtimeEnv =
    process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production";
  if (runtimeEnv === "production") {
    return NextResponse.json(
      { error: "Dev-only endpoint disabled in production." },
      { status: 403 }
    );
  }
  if (process.env.DEV_OTP_PEEK_ENABLED !== "true") {
    return NextResponse.json(
      {
        error:
          "DEV_OTP_PEEK_ENABLED must be set to 'true' to use this endpoint.",
      },
      { status: 403 }
    );
  }

  const { eventSlug } = await params;
  const url = new URL(req.url);
  const email = url.searchParams.get("email");
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Valid email query parameter is required." },
      { status: 400 }
    );
  }

  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json(
      { error: "Event not found." },
      { status: 404 }
    );
  }

  const result = await issueDevOtpForEvent(event.id, email);
  if (!result) {
    return NextResponse.json(
      { error: "No registration found for that email on this event." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    code: result.code,
    expiresAt: result.expiresAt.toISOString(),
    note: "Good for 10 minutes. Use it on the portal login page.",
  });
}
