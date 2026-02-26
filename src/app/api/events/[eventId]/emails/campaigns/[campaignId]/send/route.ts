import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { renderEmailTemplate, renderSubject } from "@/lib/email-renderer";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; campaignId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId, campaignId } = await params;

  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    include: { template: true, event: true },
  });

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  if (campaign.status === "SENDING" || campaign.status === "COMPLETED") {
    return NextResponse.json({ error: "Campaign already sent or in progress" }, { status: 400 });
  }

  // Get recipients based on filter
  const filter = (campaign.recipientFilter as Record<string, string>) || {};
  const contactWhere: Record<string, unknown> = { eventId };

  if (filter.category) contactWhere.category = filter.category;
  if (filter.registrationStatus) {
    contactWhere.registration = { status: filter.registrationStatus };
  }

  const contacts = await prisma.contact.findMany({
    where: contactWhere,
    include: { registration: true },
  });

  // Update campaign status
  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: "SENDING",
      totalRecipients: contacts.length,
    },
  });

  let sentCount = 0;
  let failedCount = 0;

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  for (const contact of contacts) {
    // Check if already sent
    const existing = await prisma.emailLog.findFirst({
      where: { campaignId, contactId: contact.id },
    });
    if (existing) continue;

    const variables = {
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      eventName: campaign.event.name,
      eventDate: campaign.event.startDate.toLocaleDateString(),
      eventVenue: campaign.event.venue || "",
      registrationLink: `${appUrl}/register/${campaign.event.slug}`,
      confirmationCode: contact.registration?.confirmationCode || "",
    };

    const html = renderEmailTemplate(
      campaign.template.bodyHtml,
      campaign.template.headerHtml,
      campaign.template.footerHtml,
      variables
    );

    const subject = renderSubject(campaign.template.subject, variables);

    try {
      const result = await sendEmail({
        to: contact.email,
        subject,
        html,
      });

      await prisma.emailLog.create({
        data: {
          campaignId,
          contactId: contact.id,
          toEmail: contact.email,
          subject,
          status: "SENT",
          sentAt: new Date(),
          resendId: result.id,
        },
      });

      sentCount++;
    } catch (error) {
      await prisma.emailLog.create({
        data: {
          campaignId,
          contactId: contact.id,
          toEmail: contact.email,
          subject,
          status: "FAILED",
          errorMessage: (error as Error).message,
        },
      });
      failedCount++;
    }
  }

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: "COMPLETED",
      sentCount,
      failedCount,
      sentAt: new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    sentCount,
    failedCount,
    total: contacts.length,
  });
}
