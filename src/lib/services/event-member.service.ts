import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";

export const eventMemberService = {
  async listForUser(userId: string) {
    return prisma.eventMember.findMany({
      where: { userId },
      include: {
        event: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  },

  async listForEvent(eventId: string) {
    return prisma.eventMember.findMany({
      where: { eventId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  },

  async replaceForUser(
    userId: string,
    assignments: { eventId: string; role: UserRole }[]
  ) {
    return prisma.$transaction([
      prisma.eventMember.deleteMany({ where: { userId } }),
      prisma.eventMember.createMany({
        data: assignments.map((a) => ({
          userId,
          eventId: a.eventId,
          role: a.role,
        })),
        skipDuplicates: true,
      }),
    ]);
  },

  async upsert(eventId: string, userId: string, role: UserRole) {
    return prisma.eventMember.upsert({
      where: { userId_eventId: { userId, eventId } },
      update: { role },
      create: { eventId, userId, role },
    });
  },

  async remove(eventId: string, userId: string) {
    return prisma.eventMember.deleteMany({
      where: { eventId, userId },
    });
  },

  async updateRole(eventId: string, userId: string, role: UserRole) {
    return prisma.eventMember.update({
      where: { userId_eventId: { userId, eventId } },
      data: { role },
    });
  },
};
