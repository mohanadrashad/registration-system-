import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/api-auth";
import { sendEventEmail } from "@/lib/services/email-provider.service";
import { renderEmailTemplate, renderSubject } from "@/lib/email-renderer";
import { eventBaseUrlFromDomain } from "@/lib/urls";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const ctx = await authorize("editor");
  if (ctx instanceof NextResponse) return ctx;

  const { eventId } = await params;
  const body = await req.json();
  const { contactIds, templateId } = body as {
    contactIds: string[];
    templateId?: string;
  };

  if (!contactIds?.length) {
    return NextResponse.json({ error: "No contacts selected" }, { status: 400 });
  }

  if (!templateId) {
    return NextResponse.json({ error: "Please select an email template." }, { status: 400 });
  }

  const template = await prisma.emailTemplate.findUnique({ where: { id: templateId } });

  if (!template) {
    return NextResponse.json(
      { error: "Email template not found. Please select a valid template." },
      { status: 400 }
    );
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { domain: { select: { customDomain: true, isVerified: true } } },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  // Create an auto campaign for audit trail
  const campaign = await prisma.emailCampaign.create({
    data: {
      eventId,
      templateId: template.id,
      name: `${template.name} - ${new Date().toLocaleDateString()}`,
      status: "SENDING",
      totalRecipients: contactIds.length,
    },
  });

  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, eventId },
    include: { registration: true },
  });

  let sentCount = 0;
  let failedCount = 0;
  const appUrl = eventBaseUrlFromDomain(event.domain);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const contact of contacts) {
    // Skip contacts with invalid email addresses
    if (!emailRegex.test(contact.email)) {
      await prisma.emailLog.create({
        data: {
          campaignId: campaign.id,
          contactId: contact.id,
          toEmail: contact.email,
          subject: template.subject,
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
      eventName: event.name,
      eventDate: event.startDate.toLocaleDateString(),
      eventVenue: event.venue || "",
      registrationLink: contact.inviteToken
        ? `${appUrl}/register/${event.slug}?token=${contact.inviteToken}`
        : `${appUrl}/register/${event.slug}`,
      confirmationCode: contact.registration?.confirmationCode || "",
      badgeUrl: contact.registration?.confirmationCode
        ? `${appUrl}/badge/${contact.registration.confirmationCode}`
        : "",
    };

    const html = renderEmailTemplate(
      template.bodyHtml,
      template.headerHtml,
      template.footerHtml,
      variables
    );
    const subject = renderSubject(template.subject, variables);

    const result = await sendEventEmail(eventId, {
      to: contact.email,
      subject,
      html,
    });

    if (result.success) {
      await prisma.emailLog.create({
        data: {
          campaignId: campaign.id,
          contactId: contact.id,
          toEmail: contact.email,
          subject,
          status: "SENT",
          sentAt: new Date(),
          resendId: result.messageId,
        },
      });

      // Update contact status for invitation templates
      if (template.type === "INVITATION" && contact.status === "IMPORTED") {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { status: "INVITED" },
        });
      }

      // Mark badge email as sent for badge delivery templates
      if (template.type === "BADGE_DELIVERY" && contact.registration?.id) {
        await prisma.registration.update({
          where: { id: contact.registration.id },
          data: { badgeEmailSent: true },
        });
      }

      sentCount++;
    } else {
      await prisma.emailLog.create({
        data: {
          campaignId: campaign.id,
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
    where: { id: campaign.id },
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
