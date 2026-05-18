/**
 * One-time-password (OTP) login for the attendee portal.
 *
 * Flow:
 *   1. Attendee enters their email on /portal/[slug].
 *   2. requestOtp() looks up their registration on this event, generates a
 *      6-digit code, stores its HMAC, and emails the plain code.
 *   3. Attendee types the code into the portal login form.
 *   4. verifyOtp() compares hashes; on match, marks the row consumed and
 *      tells the API route to issue a session cookie.
 *
 * Codes expire after OTP_TTL_MS. Each row tolerates up to OTP_MAX_ATTEMPTS
 * verify attempts before being burned. Issuing a fresh code invalidates any
 * existing unconsumed codes for the same registration.
 */
import { createHmac, randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEventEmail } from "@/lib/services/email-provider.service";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET env var is required for OTP hashing.");
  }
  return createHmac("sha256", secret).update(code).digest("hex");
}

function generateCode(): string {
  // 6-digit code, leading-zero-padded.
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface OtpRequestResult {
  // We never reveal whether the email matched a registration. Always return
  // success=true to the caller; this flag is for internal telemetry only.
  generated: boolean;
}

export async function requestOtpForEvent(
  eventId: string,
  emailRaw: string
): Promise<OtpRequestResult> {
  const email = emailRaw.trim().toLowerCase();

  const registration = await prisma.registration.findFirst({
    where: { eventId, contact: { email } },
    select: { id: true, contact: { select: { firstName: true } } },
  });

  if (!registration) {
    // Pretend we sent something so attackers can't probe which emails are
    // registered. Returns immediately.
    return { generated: false };
  }

  // Burn any prior unconsumed codes for this registration.
  await prisma.portalOtp.updateMany({
    where: { registrationId: registration.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateCode();
  await prisma.portalOtp.create({
    data: {
      registrationId: registration.id,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  // Send the email. We don't await failure-handling beyond logging — if the
  // email send fails the user can hit "Resend code" and we'll retry.
  await sendOtpEmail({
    eventId,
    toEmail: email,
    firstName: registration.contact.firstName,
    code,
  });

  return { generated: true };
}

/**
 * Dev-only: generate and store a fresh OTP for the given email's
 * registration on this event, returning the plain code so a developer
 * can log into the portal without receiving an email. Same generation
 * + hashing as the regular requestOtpForEvent flow but skips the email
 * send — the whole point is testing portal flows when email infra
 * isn't reliable on staging.
 *
 * Pending unconsumed OTPs for the same registration are burned to
 * preserve the "at most one live code per registration" invariant.
 *
 * Caller is responsible for environment-gating this — never invoke
 * outside the env-protected dev-peek route.
 */
export async function issueDevOtpForEvent(
  eventId: string,
  emailRaw: string
): Promise<{ code: string; expiresAt: Date } | null> {
  const email = emailRaw.trim().toLowerCase();

  const registration = await prisma.registration.findFirst({
    where: { eventId, contact: { email } },
    select: { id: true },
  });
  if (!registration) return null;

  await prisma.portalOtp.updateMany({
    where: { registrationId: registration.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await prisma.portalOtp.create({
    data: {
      registrationId: registration.id,
      codeHash: hashCode(code),
      expiresAt,
    },
  });

  return { code, expiresAt };
}

export type VerifyOtpResult =
  | { ok: true; registrationId: string }
  | { ok: false; reason: "invalid" | "expired" | "exhausted" };

export async function verifyOtpForEvent(
  eventId: string,
  emailRaw: string,
  codeRaw: string
): Promise<VerifyOtpResult> {
  const email = emailRaw.trim().toLowerCase();
  const code = codeRaw.trim();

  if (!/^\d{6}$/.test(code)) {
    return { ok: false, reason: "invalid" };
  }

  const registration = await prisma.registration.findFirst({
    where: { eventId, contact: { email } },
    select: { id: true },
  });
  if (!registration) {
    return { ok: false, reason: "invalid" };
  }

  // Most recent unconsumed OTP for this registration.
  const otp = await prisma.portalOtp.findFirst({
    where: {
      registrationId: registration.id,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    return { ok: false, reason: "invalid" };
  }

  if (otp.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "exhausted" };
  }

  const submittedHash = hashCode(code);
  if (submittedHash !== otp.codeHash) {
    await prisma.portalOtp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "invalid" };
  }

  // Match — burn the row.
  await prisma.portalOtp.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });
  return { ok: true, registrationId: registration.id };
}

interface SendOtpEmailArgs {
  eventId: string;
  toEmail: string;
  firstName: string | null;
  code: string;
}

async function sendOtpEmail({
  eventId,
  toEmail,
  firstName,
  code,
}: SendOtpEmailArgs): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { name: true, branding: { select: { primaryColor: true } } },
  });
  const eventName = event?.name ?? "the event";
  const primaryColor = event?.branding?.primaryColor || "#7dc242";
  const greeting = firstName ? `Hi ${firstName},` : "Hello,";

  const subject = `Your sign-in code for ${eventName}: ${code}`;
  const html = otpEmailHtml({ eventName, greeting, code, primaryColor });

  await sendEventEmail(eventId, { to: toEmail, subject, html });
}

function otpEmailHtml({
  eventName,
  greeting,
  code,
  primaryColor,
}: {
  eventName: string;
  greeting: string;
  code: string;
  primaryColor: string;
}): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <tr><td style="height:6px;background:${primaryColor};"></td></tr>
    <tr>
      <td style="padding:32px 28px 8px;">
        <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${greeting}</p>
        <p style="margin:0 0 8px;font-size:16px;line-height:1.5;">
          Your sign-in code for <strong>${eventName}</strong> is:
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 28px 24px;">
        <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:36px;letter-spacing:8px;font-weight:700;text-align:center;padding:18px 0;background:#f3f4f6;border-radius:10px;color:#111827;">
          ${code}
        </div>
        <p style="margin:18px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
          This code expires in 10 minutes and can only be used once. If you didn't request it, you can safely ignore this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
