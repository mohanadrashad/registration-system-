import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const badgeService = {
  // Badge Templates
  async getTemplate(eventId: string) {
    return prisma.badgeTemplate.findUnique({
      where: { eventId },
    });
  },

  async createTemplate(data: Prisma.BadgeTemplateCreateInput) {
    return prisma.badgeTemplate.create({ data });
  },

  async updateTemplate(eventId: string, data: Prisma.BadgeTemplateUpdateInput) {
    return prisma.badgeTemplate.update({
      where: { eventId },
      data,
    });
  },

  async upsertTemplate(
    eventId: string,
    data: Omit<Prisma.BadgeTemplateCreateInput, "event">
  ) {
    return prisma.badgeTemplate.upsert({
      where: { eventId },
      create: {
        ...data,
        event: { connect: { id: eventId } },
      },
      update: data,
    });
  },

  // Badges
  async getBadgeByRegistrationId(registrationId: string) {
    return prisma.badge.findUnique({
      where: { registrationId },
      include: {
        registration: {
          include: {
            contact: true,
            event: true,
          },
        },
        template: true,
      },
    });
  },

  async createBadge(data: {
    registrationId: string;
    templateId: string;
    pdfUrl?: string;
    imageUrl?: string;
    qrCodeData?: string;
  }) {
    return prisma.badge.create({
      data: {
        registrationId: data.registrationId,
        templateId: data.templateId,
        pdfUrl: data.pdfUrl,
        imageUrl: data.imageUrl,
        qrCodeData: data.qrCodeData,
      },
    });
  },

  async updateBadge(
    registrationId: string,
    data: { pdfUrl?: string; imageUrl?: string }
  ) {
    return prisma.badge.update({
      where: { registrationId },
      data,
    });
  },

  async deleteBadge(registrationId: string) {
    return prisma.badge.delete({
      where: { registrationId },
    });
  },

  // Bulk operations
  async getRegistrationsWithoutBadges(eventId: string) {
    return prisma.registration.findMany({
      where: {
        eventId,
        status: "CONFIRMED",
        badge: null,
      },
      include: {
        contact: true,
      },
    });
  },

  async getRegistrationsWithBadges(eventId: string) {
    return prisma.registration.findMany({
      where: {
        eventId,
        status: "CONFIRMED",
        badge: { isNot: null },
      },
      include: {
        contact: true,
        badge: true,
      },
    });
  },

  async getBadgeStats(eventId: string) {
    const [total, generated, emailSent] = await Promise.all([
      prisma.registration.count({
        where: { eventId, status: "CONFIRMED" },
      }),
      prisma.registration.count({
        where: { eventId, status: "CONFIRMED", badgeGenerated: true },
      }),
      prisma.registration.count({
        where: { eventId, status: "CONFIRMED", badgeEmailSent: true },
      }),
    ]);

    return {
      totalConfirmed: total,
      badgesGenerated: generated,
      badgeEmailsSent: emailSent,
      pendingGeneration: total - generated,
      pendingEmail: generated - emailSent,
    };
  },
};
