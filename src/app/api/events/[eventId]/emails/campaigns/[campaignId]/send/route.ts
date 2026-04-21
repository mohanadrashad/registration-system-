import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/api-auth";
import { sendEventEmail } from "@/lib/services/email-provider.service";
import { renderEmailTemplate, renderSubject } from "@/lib/email-renderer";
import { eventBaseUrlFromDomain } from "@/lib/urls";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ eventId: string; campaignId: string }> }
) {
  const ctx = await authorize("editor");
  if (ctx instanceof NextResponse) return ctx;

  const { eventId, campaignId } = await params;

  // Atomically transition status from DRAFT/SCHEDULED/FAILED → SENDING to prevent
  // concurrent sends racing past the status check.
  const claimed = await prisma.emailCampaign.updateMany({
    where: {
      id: campaignId,
      eventId,
      status: { in: ["DRAFT", "SCHEDULED", "FAILED"] },
    },
    data: { status: "SENDING" },
  });

  if (claimed.count === 0) {
    const existing = await prisma.emailCampaign.findFirst({
      where: { id: campaignId, eventId },
      select: { id: true, status: true },
    });
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    return NextResponse.json(
      { error: "Campaign already sent or in progress", status: existing.status },
      { status: 409 }
    );
  }

  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    include: {
      template: true,
      event: { include: { domain: { select: { customDomain: true, isVerified: true } } } },
    },
  });

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

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

  await prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { totalRecipients: contacts.length },
  });

  let sentCount = 0;
  let failedCount = 0;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const appUrl = eventBaseUrlFromDomain(campaign.event.domain);

  for (const contact of contacts) {
    // Check if already sent
    const existing = await prisma.emailLog.findFirst({
      where: { campaignId, contactId: contact.id },
    });
    if (existing) continue;

    // Skip contacts with invalid email addresses
    if (!emailRegex.test(contact.email)) {
      await prisma.emailLog.create({
        data: {
          campaignId,
          contactId: contact.id,
          toEmail: contact.email,
          subject: campaign.template.subject,
          status: "FAILED",
          errorMessage: "Invalid email address",
        },
      });
      failedCount++;
      continue;
    }

    const variables = {
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      eventName: campaign.event.name,
      eventDate: campaign.event.startDate.toLocaleDateString(),
      eventVenue: campaign.event.venue || "",
      registrationLink: contact.inviteToken
        ? `${appUrl}/register/${campaign.event.slug}?token=${contact.inviteToken}`
        : `${appUrl}/register/${campaign.event.slug}`,
      confirmationCode: contact.registration?.confirmationCode || "",
    };

    const html = renderEmailTemplate(
      campaign.template.bodyHtml,
      campaign.template.headerHtml,
      campaign.template.footerHtml,
      variables
    );

    const subject = renderSubject(campaign.template.subject, variables);

    const result = await sendEventEmail(eventId, {
      to: contact.email,
      subject,
      html,
    });

    if (result.success) {
      await prisma.emailLog.create({
        data: {
          campaignId,
          contactId: contact.id,
          toEmail: contact.email,
          subject,
          status: "SENT",
          sentAt: new Date(),
          resendId: result.messageId,
        },
      });
      sentCount++;
    } else {
      await prisma.emailLog.create({
        data: {
          campaignId,
          contactId: contact.id,
          toEmail: contact.email,
          subject,
          status: "FAILED",
          errorMessage: result.error ?? "Unknown error",
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
