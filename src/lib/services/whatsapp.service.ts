import { prisma } from "@/lib/prisma";
import { WhatsAppStatus, WhatsAppProvider } from "@prisma/client";

interface SendTemplateParams {
  eventId: string;
  contactId: string;
  phoneNumber: string;
  templateName: string;
  variables: Record<string, string>;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  logId?: string;
}

/**
 * WhatsApp Service for sending messages via Meta Business API
 */
export const whatsAppService = {
  /**
   * Get WhatsApp settings for an event
   */
  async getSettings(eventId: string) {
    return prisma.eventWhatsAppSettings.findUnique({
      where: { eventId },
    });
  },

  /**
   * Check if WhatsApp is enabled and configured for an event
   */
  async isEnabled(eventId: string): Promise<boolean> {
    const settings = await this.getSettings(eventId);
    return !!(settings?.isActive && settings?.accessToken && settings?.phoneNumberId);
  },

  /**
   * Send a WhatsApp template message
   */
  async sendTemplate(params: SendTemplateParams): Promise<SendResult> {
    const { eventId, contactId, phoneNumber, templateName, variables } = params;

    // Get settings
    const settings = await this.getSettings(eventId);
    if (!settings || !settings.isActive) {
      return { success: false, error: "WhatsApp not enabled for this event" };
    }

    if (!settings.accessToken || !settings.phoneNumberId) {
      return { success: false, error: "WhatsApp credentials not configured" };
    }

    // Clean phone number (remove spaces, dashes, etc.)
    const cleanPhone = phoneNumber.replace(/[^0-9+]/g, "");

    // Create log entry
    const log = await prisma.whatsAppLog.create({
      data: {
        eventId,
        contactId,
        templateName,
        phoneNumber: cleanPhone,
        status: "PENDING",
        variables,
      },
    });

    try {
      // Build template components from variables
      const components = this.buildTemplateComponents(variables);

      // Send via Meta API
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${settings.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${settings.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanPhone,
            type: "template",
            template: {
              name: templateName,
              language: { code: "en" }, // or "ar" for Arabic
              components,
            },
          }),
        }
      );

      const data = await response.json();

      if (response.ok && data.messages?.[0]?.id) {
        // Update log with success
        await prisma.whatsAppLog.update({
          where: { id: log.id },
          data: {
            status: "SENT",
            messageId: data.messages[0].id,
            sentAt: new Date(),
          },
        });

        return {
          success: true,
          messageId: data.messages[0].id,
          logId: log.id,
        };
      } else {
        // Update log with error
        const errorMsg = data.error?.message || "Unknown error";
        await prisma.whatsAppLog.update({
          where: { id: log.id },
          data: {
            status: "FAILED",
            failedAt: new Date(),
            errorMessage: errorMsg,
          },
        });

        return { success: false, error: errorMsg, logId: log.id };
      }
    } catch (error) {
      // Update log with error
      const errorMsg = error instanceof Error ? error.message : "Network error";
      await prisma.whatsAppLog.update({
        where: { id: log.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          errorMessage: errorMsg,
        },
      });

      return { success: false, error: errorMsg, logId: log.id };
    }
  },

  /**
   * Build template components from variables
   */
  buildTemplateComponents(variables: Record<string, string>) {
    // Convert variables object to Meta template format
    // Variables are typically used in header, body, or buttons
    const bodyParams = Object.values(variables).map((value) => ({
      type: "text",
      text: value,
    }));

    if (bodyParams.length === 0) return [];

    return [
      {
        type: "body",
        parameters: bodyParams,
      },
    ];
  },

  /**
   * Send registration confirmation via WhatsApp
   */
  async sendConfirmation(registrationId: string): Promise<SendResult> {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        contact: true,
        event: {
          include: {
            whatsAppSettings: true,
          },
        },
      },
    });

    if (!registration) {
      return { success: false, error: "Registration not found" };
    }

    const settings = registration.event.whatsAppSettings;
    if (!settings?.isActive || !settings.confirmationTemplate) {
      return { success: false, error: "WhatsApp confirmation not configured" };
    }

    if (!registration.contact.phone) {
      return { success: false, error: "Contact has no phone number" };
    }

    return this.sendTemplate({
      eventId: registration.eventId,
      contactId: registration.contactId,
      phoneNumber: registration.contact.phone,
      templateName: settings.confirmationTemplate,
      variables: {
        "1": registration.contact.firstName,
        "2": registration.event.name,
        "3": registration.confirmationCode,
      },
    });
  },

  /**
   * Send badge delivery via WhatsApp
   */
  async sendBadge(registrationId: string, badgeUrl: string): Promise<SendResult> {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        contact: true,
        event: {
          include: {
            whatsAppSettings: true,
          },
        },
      },
    });

    if (!registration) {
      return { success: false, error: "Registration not found" };
    }

    const settings = registration.event.whatsAppSettings;
    if (!settings?.isActive || !settings.badgeTemplate) {
      return { success: false, error: "WhatsApp badge delivery not configured" };
    }

    if (!registration.contact.phone) {
      return { success: false, error: "Contact has no phone number" };
    }

    return this.sendTemplate({
      eventId: registration.eventId,
      contactId: registration.contactId,
      phoneNumber: registration.contact.phone,
      templateName: settings.badgeTemplate,
      variables: {
        "1": registration.contact.firstName,
        "2": registration.event.name,
        "3": badgeUrl,
      },
    });
  },

  /**
   * Send bulk reminders
   */
  async sendReminders(
    eventId: string,
    contactIds: string[]
  ): Promise<{ sent: number; failed: number; errors: string[] }> {
    const settings = await this.getSettings(eventId);
    if (!settings?.isActive || !settings.reminderTemplate) {
      return { sent: 0, failed: 0, errors: ["WhatsApp reminders not configured"] };
    }

    const contacts = await prisma.contact.findMany({
      where: {
        id: { in: contactIds },
        eventId,
        phone: { not: null },
        registration: { status: "CONFIRMED" },
      },
      include: {
        event: true,
        registration: true,
      },
    });

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const contact of contacts) {
      if (!contact.phone) continue;

      const result = await this.sendTemplate({
        eventId,
        contactId: contact.id,
        phoneNumber: contact.phone,
        templateName: settings.reminderTemplate,
        variables: {
          "1": contact.firstName,
          "2": contact.event.name,
          "3": new Date(contact.event.startDate).toLocaleDateString(),
        },
      });

      if (result.success) {
        sent++;
      } else {
        failed++;
        errors.push(`${contact.email}: ${result.error}`);
      }

      // Rate limiting - wait 100ms between messages
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return { sent, failed, errors };
  },

  /**
   * Update message status from webhook
   */
  async updateMessageStatus(
    messageId: string,
    status: WhatsAppStatus,
    timestamp?: Date
  ) {
    const log = await prisma.whatsAppLog.findFirst({
      where: { messageId },
    });

    if (!log) return null;

    const updateData: Record<string, unknown> = { status };

    if (status === "DELIVERED" && timestamp) {
      updateData.deliveredAt = timestamp;
    } else if (status === "READ" && timestamp) {
      updateData.readAt = timestamp;
    } else if (status === "FAILED" && timestamp) {
      updateData.failedAt = timestamp;
    }

    return prisma.whatsAppLog.update({
      where: { id: log.id },
      data: updateData,
    });
  },

  /**
   * Get message logs for an event
   */
  async getLogs(eventId: string, options?: { limit?: number; status?: WhatsAppStatus }) {
    return prisma.whatsAppLog.findMany({
      where: {
        eventId,
        ...(options?.status && { status: options.status }),
      },
      include: {
        contact: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: options?.limit || 50,
    });
  },

  /**
   * Get stats for an event
   */
  async getStats(eventId: string) {
    const stats = await prisma.whatsAppLog.groupBy({
      by: ["status"],
      where: { eventId },
      _count: true,
    });

    const result: Record<string, number> = {
      total: 0,
      pending: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
    };

    for (const stat of stats) {
      result[stat.status.toLowerCase()] = stat._count;
      result.total += stat._count;
    }

    return result;
  },
};
