import { prisma } from "@/lib/prisma";
import { Event, Prisma } from "@prisma/client";

export const eventService = {
  async findAll() {
    return prisma.event.findMany({
      orderBy: { createdAt: "desc" },
    });
  },

  async findById(id: string) {
    return prisma.event.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            contacts: true,
            registrations: true,
          },
        },
      },
    });
  },

  async findBySlug(slug: string) {
    return prisma.event.findUnique({
      where: { slug },
    });
  },

  async findByIdWithDetails(id: string) {
    return prisma.event.findUnique({
      where: { id },
      include: {
        contacts: true,
        registrations: {
          include: {
            contact: true,
          },
        },
        emailTemplates: true,
        badgeTemplate: true,
        _count: {
          select: {
            contacts: true,
            registrations: true,
            emailCampaigns: true,
          },
        },
      },
    });
  },

  async create(data: Prisma.EventCreateInput) {
    return prisma.event.create({ data });
  },

  async update(id: string, data: Prisma.EventUpdateInput) {
    return prisma.event.update({ where: { id }, data });
  },

  async delete(id: string) {
    return prisma.event.delete({ where: { id } });
  },

  async getStats(id: string) {
    const [contacts, registrations] = await Promise.all([
      prisma.contact.count({ where: { eventId: id } }),
      prisma.registration.groupBy({
        by: ["status"],
        where: { eventId: id },
        _count: true,
      }),
    ]);

    const registrationStats = registrations.reduce(
      (acc, r) => ({ ...acc, [r.status]: r._count }),
      {} as Record<string, number>
    );

    return {
      totalContacts: contacts,
      registrations: registrationStats,
    };
  },
};
