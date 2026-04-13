import { prisma } from "@/lib/prisma";
import { Prisma, RegistrationStatus } from "@prisma/client";

export const registrationService = {
  async findByEventId(
    eventId: string,
    options?: {
      status?: RegistrationStatus;
      search?: string;
      skip?: number;
      take?: number;
    }
  ) {
    const where: Prisma.RegistrationWhereInput = { eventId };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.search) {
      where.contact = {
        OR: [
          { firstName: { contains: options.search, mode: "insensitive" } },
          { lastName: { contains: options.search, mode: "insensitive" } },
          { email: { contains: options.search, mode: "insensitive" } },
        ],
      };
    }

    const [registrations, total] = await Promise.all([
      prisma.registration.findMany({
        where,
        include: {
          contact: true,
          badge: true,
        },
        orderBy: { createdAt: "desc" },
        skip: options?.skip,
        take: options?.take,
      }),
      prisma.registration.count({ where }),
    ]);

    return { registrations, total };
  },

  async findById(id: string) {
    return prisma.registration.findUnique({
      where: { id },
      include: {
        contact: true,
        badge: true,
        event: true,
      },
    });
  },

  async findByConfirmationCode(code: string) {
    return prisma.registration.findUnique({
      where: { confirmationCode: code },
      include: {
        contact: true,
        event: true,
        badge: true,
      },
    });
  },

  async findByContactId(contactId: string) {
    return prisma.registration.findUnique({
      where: { contactId },
      include: {
        contact: true,
        badge: true,
      },
    });
  },

  async create(data: {
    contactId: string;
    eventId: string;
    formData?: Prisma.InputJsonValue;
  }) {
    return prisma.registration.create({
      data: {
        contactId: data.contactId,
        eventId: data.eventId,
        status: "CONFIRMED",
        registeredAt: new Date(),
        formData: data.formData,
      },
      include: {
        contact: true,
      },
    });
  },

  async updateStatus(id: string, status: RegistrationStatus) {
    return prisma.registration.update({
      where: { id },
      data: { status },
    });
  },

  async updateBadgeStatus(
    id: string,
    data: { badgeGenerated?: boolean; badgeEmailSent?: boolean; badgeUrl?: string }
  ) {
    return prisma.registration.update({
      where: { id },
      data,
    });
  },

  async delete(id: string) {
    return prisma.registration.delete({ where: { id } });
  },

  async getStats(eventId: string) {
    const [total, byStatus, byDay] = await Promise.all([
      prisma.registration.count({ where: { eventId } }),
      prisma.registration.groupBy({
        by: ["status"],
        where: { eventId },
        _count: true,
      }),
      prisma.registration.groupBy({
        by: ["registeredAt"],
        where: {
          eventId,
          registeredAt: { not: null },
        },
        _count: true,
        orderBy: { registeredAt: "asc" },
      }),
    ]);

    return {
      total,
      byStatus: byStatus.reduce(
        (acc, r) => ({ ...acc, [r.status]: r._count }),
        {} as Record<RegistrationStatus, number>
      ),
      registrationTrend: byDay,
    };
  },
};
