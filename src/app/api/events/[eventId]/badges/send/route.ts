import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const registrations = await prisma.registration.findMany({
    where: { eventId, status: "CONFIRMED", badgeGenerated: true },
    include: { contact: true },
  });

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let sent = 0;
  let failed = 0;

  for (const reg of registrations) {
    const badgeUrl = `${appUrl}/badge/${reg.confirmationCode}`;

    try {
      await sendEmail({
        to: reg.contact.email,
        subject: `Your E-Badge for ${event.name}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Hello ${reg.contact.firstName},</h2>
            <p>Your e-badge for <strong>${event.name}</strong> is ready!</p>
            <p>You can view and download your badge using the link below:</p>
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 30px 0;">
              <tr>
                <td align="center">
                  <table border="0" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" bgcolor="#1a1a2e" style="border-radius: 6px;">
                        <a href="${badgeUrl}" target="_blank" style="display: block; padding: 12px 24px; font-family: sans-serif; font-size: 16px; color: #ffffff; text-decoration: none;">
                          View My Badge
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <p>Your confirmation code: <strong>${reg.confirmationCode}</strong></p>
            <p style="color: #666; font-size: 14px;">
              Please bring this badge (printed or on your device) to the event for check-in.
            </p>
          </div>
        `,
      });
      sent++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ success: true, sent, failed, total: registrations.length });
}
