import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { resend } from "@/lib/resend";
import { renderEmailTemplate, renderSubject } from "@/lib/email-renderer";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  const event = await prisma.event.findUnique({ where: { id: eventId } });
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  for (const contact of contacts) {
    const variables = {
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      eventName: event.name,
      eventDate: event.startDate.toLocaleDateString(),
      eventVenue: event.venue || "",
      registrationLink: `${appUrl}/register/${event.slug}`,
      confirmationCode: contact.registration?.confirmationCode || "",
    };

    const html = renderEmailTemplate(
      template.bodyHtml,
      template.headerHtml,
      template.footerHtml,
      variables
    );
    const subject = renderSubject(template.subject, variables);

    try {
      const result = await resend.emails.send({
        from: "Registration System <onboarding@resend.dev>",
        to: contact.email,
        subject,
        html,
      });

      await prisma.emailLog.create({
        data: {
          campaignId: campaign.id,
          contactId: contact.id,
          toEmail: contact.email,
          subject,
          status: "SENT",
          sentAt: new Date(),
          resendId: result.data?.id,
        },
      });

      // Update contact status for invitation templates
      if (template.type === "INVITATION" && contact.status === "IMPORTED") {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { status: "INVITED" },
        });
      }

      sentCount++;
    } catch (error) {
      await prisma.emailLog.create({
        data: {
          campaignId: campaign.id,
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
