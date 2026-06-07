import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeEvent } from "@/lib/api-auth";
import { sendEventEmail } from "@/lib/services/email-provider.service";
import { eventBaseUrlFromDomain } from "@/lib/urls";
import {
  SYNTHETIC_EMAIL_DOMAIN,
  SYNTHETIC_EMAIL_PREFIX,
} from "@/lib/contact/synthetic-email";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const ctx = await authorizeEvent(eventId, { role: "editor" });
  if (ctx instanceof NextResponse) return ctx;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { domain: { select: { customDomain: true, isVerified: true } } },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Count badge-ready registrations before filtering so we can report
  // how many were skipped because they have no real email. The two
  // queries run sequentially but each is index-backed and small.
  const eligible = await prisma.registration.count({
    where: { eventId, status: "CONFIRMED", badgeGenerated: true },
  });
  const registrations = await prisma.registration.findMany({
    where: {
      eventId,
      status: "CONFIRMED",
      badgeGenerated: true,
      // Exclude synthetic-email contacts. Their badges still exist as
      // PDFs (in-person check-in works fine), but the email address is
      // a placeholder that would bounce. Filter at the query level
      // rather than per-iteration so the count math stays simple.
      NOT: {
        contact: {
          email: {
            startsWith: SYNTHETIC_EMAIL_PREFIX,
            endsWith: `@${SYNTHETIC_EMAIL_DOMAIN}`,
          },
        },
      },
    },
    include: { contact: true },
  });
  const skipped = eligible - registrations.length;

  const appUrl = eventBaseUrlFromDomain(event.domain);
  let sent = 0;
  let failed = 0;

  for (const reg of registrations) {
    const badgeUrl = `${appUrl}/badge/${reg.confirmationCode}`;

    const result = await sendEventEmail(eventId, {
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
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${badgeUrl}" style="height:44px;v-text-anchor:middle;width:180px;" arcsize="14%" strokecolor="#1a1a2e" fillcolor="#1a1a2e">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:sans-serif;font-size:16px;">View My Badge</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="${badgeUrl}" target="_blank" style="background-color:#1a1a2e;border-radius:6px;color:#ffffff;display:inline-block;font-family:sans-serif;font-size:16px;line-height:44px;text-align:center;text-decoration:none;width:180px;-webkit-text-size-adjust:none;">View My Badge</a>
                <!--<![endif]-->
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

    if (result.success) {
      sent++;
      await prisma.registration.update({
        where: { id: reg.id },
        data: { badgeEmailSent: true },
      });
    } else {
      failed++;
    }
  }

  return NextResponse.json({
    success: true,
    sent,
    failed,
    skipped,
    total: registrations.length,
  });
}
