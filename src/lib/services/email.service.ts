import { prisma } from "@/lib/prisma";
import { sendEventEmail } from "./email-provider.service";
import { renderEmailTemplate } from "@/lib/email-renderer";
import { EmailLogStatus, EmailTemplateType, Prisma } from "@prisma/client";

export const emailService = {
  // Templates
  async getTemplates(eventId: string) {
    return prisma.emailTemplate.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
    });
  },

  async getTemplateById(id: string) {
    return prisma.emailTemplate.findUnique({
      where: { id },
    });
  },

  async getTemplateByType(eventId: string, type: EmailTemplateType) {
    return prisma.emailTemplate.findFirst({
      where: { eventId, type, isDefault: true },
    });
  },

  async createTemplate(data: Prisma.EmailTemplateCreateInput) {
    return prisma.emailTemplate.create({ data });
  },

  async updateTemplate(id: string, data: Prisma.EmailTemplateUpdateInput) {
    return prisma.emailTemplate.update({ where: { id }, data });
  },

  async deleteTemplate(id: string) {
    return prisma.emailTemplate.delete({ where: { id } });
  },

  // Campaigns
  async getCampaigns(eventId: string) {
    return prisma.emailCampaign.findMany({
      where: { eventId },
      include: {
        template: true,
        _count: {
          select: { logs: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async getCampaignById(id: string) {
    return prisma.emailCampaign.findUnique({
      where: { id },
      include: {
        template: true,
        logs: {
          include: { contact: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  },

  // Sending
  async sendToContact(params: {
    contactId: string;
    templateId: string;
    campaignId?: string;
    variables?: Record<string, string>;
  }) {
    const [contact, template] = await Promise.all([
      prisma.contact.findUnique({
        where: { id: params.contactId },
        include: { event: true, registration: true },
      }),
      prisma.emailTemplate.findUnique({ where: { id: params.templateId } }),
    ]);

    if (!contact || !template) {
      throw new Error("Contact or template not found");
    }

    // Create log entry
    const log = await prisma.emailLog.create({
      data: {
        contactId: contact.id,
        campaignId: params.campaignId,
        toEmail: contact.email,
        subject: template.subject,
        status: "QUEUED",
      },
    });

    try {
      // Render and send email
      const html = renderEmailTemplate(
        template.bodyHtml,
        template.headerHtml,
        template.footerHtml,
        {
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          organization: contact.organization || "",
          eventName: contact.event.name,
          confirmationCode: contact.registration?.confirmationCode || "",
          ...params.variables,
        }
      );

      const result = await sendEventEmail(contact.eventId, {
        to: contact.email,
        subject: template.subject,
        html,
      });

      if (!result.success) {
        await prisma.emailLog.update({
          where: { id: log.id },
          data: {
            status: "FAILED",
            errorMessage: result.error ?? "Unknown error",
          },
        });
        return { success: false, error: result.error, logId: log.id };
      }

      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          resendId: result.messageId,
        },
      });

      return { success: true, logId: log.id };
    } catch (error) {
      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        },
      });

      return { success: false, error, logId: log.id };
    }
  },

  // Logs
  async getLogsByContact(contactId: string) {
    return prisma.emailLog.findMany({
      where: { contactId },
      orderBy: { createdAt: "desc" },
    });
  },

  async updateLogStatus(id: string, status: EmailLogStatus, data?: { openedAt?: Date }) {
    return prisma.emailLog.update({
      where: { id },
      data: { status, ...data },
    });
  },
};
