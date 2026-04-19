import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { EmailProvider, EventEmailSettings } from "@prisma/client";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Get email settings for an event, or null for system default
 */
export async function getEventEmailSettings(
  eventId: string
): Promise<EventEmailSettings | null> {
  return prisma.eventEmailSettings.findUnique({
    where: { eventId },
  });
}

/**
 * Create a nodemailer transporter based on settings
 */
function createTransporter(settings: EventEmailSettings | null) {
  if (!settings || settings.provider === "SYSTEM") {
    // Use system default
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD,
      },
    });
  }

  if (settings.provider === "CUSTOM_SMTP") {
    const port = settings.smtpPort || 587;
    // Implicit TLS only on 465. All other ports (587, 25, 2525) use STARTTLS.
    const secure = port === 465;
    return nodemailer.createTransport({
      host: settings.smtpHost!,
      port,
      secure,
      requireTLS: !secure && settings.smtpSecure !== false,
      auth: {
        user: settings.smtpUser!,
        pass: settings.smtpPassword!,
      },
    });
  }

  if (settings.provider === "RESEND") {
    // Resend uses SMTP interface
    return nodemailer.createTransport({
      host: "smtp.resend.com",
      port: 465,
      secure: true,
      auth: {
        user: "resend",
        pass: settings.apiKey!,
      },
    });
  }

  if (settings.provider === "SENDGRID") {
    return nodemailer.createTransport({
      host: "smtp.sendgrid.net",
      port: 587,
      secure: false,
      auth: {
        user: "apikey",
        pass: settings.apiKey!,
      },
    });
  }

  if (settings.provider === "MAILGUN") {
    // Mailgun SMTP - domain is extracted from fromEmail
    const domain = settings.fromEmail.split("@")[1];
    return nodemailer.createTransport({
      host: `smtp.mailgun.org`,
      port: 587,
      secure: false,
      auth: {
        user: `postmaster@${domain}`,
        pass: settings.apiKey!,
      },
    });
  }

  // Fallback to system
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp-relay.brevo.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD,
    },
  });
}

/**
 * Get the "from" address based on settings
 */
function getFromAddress(settings: EventEmailSettings | null): string {
  if (settings && settings.provider !== "SYSTEM") {
    return `${settings.fromName} <${settings.fromEmail}>`;
  }
  return (
    process.env.SMTP_FROM ||
    `${process.env.SMTP_FROM_NAME || "Registration System"} <${process.env.SMTP_FROM_EMAIL || "noreply@yourdomain.com"}>`
  );
}

/**
 * Send email using system default settings
 */
export async function sendEmail(params: SendEmailParams): Promise<EmailResult> {
  try {
    const transporter = createTransporter(null);
    const from = params.from || getFromAddress(null);

    const result = await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
    });

    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("Failed to send email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send email for a specific event (uses event's email settings if configured)
 */
export async function sendEventEmail(
  eventId: string,
  params: SendEmailParams
): Promise<EmailResult> {
  try {
    const settings = await getEventEmailSettings(eventId);

    // Check if custom email module is enabled and settings are verified
    if (settings && settings.provider !== "SYSTEM" && !settings.isVerified) {
      console.warn(
        `Event ${eventId} has unverified email settings, falling back to system`
      );
      return sendEmail(params);
    }

    const transporter = createTransporter(settings);
    const from = params.from || getFromAddress(settings);

    const result = await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo || settings?.replyTo || undefined,
    });

    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("Failed to send event email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Test email settings by sending a test email
 */
export async function testEmailSettings(
  settings: Partial<EventEmailSettings>,
  testEmail: string
): Promise<EmailResult> {
  try {
    const transporter = createTransporter(settings as EventEmailSettings);

    const result = await transporter.sendMail({
      from: `${settings.fromName} <${settings.fromEmail}>`,
      to: testEmail,
      subject: "Test Email - Registration System",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Email Configuration Test</h2>
          <p>This is a test email to verify your email settings are working correctly.</p>
          <p><strong>Provider:</strong> ${settings.provider}</p>
          <p><strong>From:</strong> ${settings.fromName} &lt;${settings.fromEmail}&gt;</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            This email was sent from the Registration System email configuration test.
          </p>
        </div>
      `,
    });

    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("Failed to send test email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Verify email settings are valid by testing connection
 */
export async function verifyEmailSettings(
  settings: Partial<EventEmailSettings>
): Promise<{ valid: boolean; error?: string }> {
  try {
    const transporter = createTransporter(settings as EventEmailSettings);
    await transporter.verify();
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}
