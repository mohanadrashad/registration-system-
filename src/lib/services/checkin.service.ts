import { prisma } from "@/lib/prisma";
import { CheckInMethod, Prisma } from "@prisma/client";

export const checkInService = {
  /**
   * Check in a registration by confirmation code
   */
  async checkIn(params: {
    eventId: string;
    confirmationCode: string;
    method: CheckInMethod;
    location?: string;
    checkInPointId?: string;
    deviceId?: string;
    checkedInBy?: string;
    notes?: string;
  }) {
    // Find the registration
    const registration = await prisma.registration.findFirst({
      where: {
        confirmationCode: params.confirmationCode,
        eventId: params.eventId,
        status: "CONFIRMED",
      },
      include: {
        contact: true,
        checkIns: {
          orderBy: { checkInTime: "desc" },
          take: 1,
        },
      },
    });

    if (!registration) {
      return {
        success: false,
        error: "Registration not found or not confirmed",
      };
    }

    // Check if already checked in (no checkout)
    const lastCheckIn = registration.checkIns[0];
    if (lastCheckIn && !lastCheckIn.checkOutTime) {
      return {
        success: false,
        error: "Already checked in",
        alreadyCheckedIn: true,
        checkIn: lastCheckIn,
        registration,
      };
    }

    // Create check-in record
    const checkIn = await prisma.checkIn.create({
      data: {
        registrationId: registration.id,
        eventId: params.eventId,
        method: params.method,
        location: params.location,
        checkInPointId: params.checkInPointId,
        deviceId: params.deviceId,
        checkedInBy: params.checkedInBy,
        notes: params.notes,
      },
    });

    return {
      success: true,
      checkIn,
      registration,
    };
  },

  /**
   * Check out a registration
   */
  async checkOut(checkInId: string) {
    const checkIn = await prisma.checkIn.findUnique({
      where: { id: checkInId },
    });

    if (!checkIn) {
      return { success: false, error: "Check-in record not found" };
    }

    if (checkIn.checkOutTime) {
      return { success: false, error: "Already checked out" };
    }

    const updated = await prisma.checkIn.update({
      where: { id: checkInId },
      data: { checkOutTime: new Date() },
    });

    return { success: true, checkIn: updated };
  },

  /**
   * Search attendees for check-in
   */
  async searchAttendees(eventId: string, query: string, limit = 10) {
    return prisma.registration.findMany({
      where: {
        eventId,
        status: "CONFIRMED",
        OR: [
          { contact: { firstName: { contains: query, mode: "insensitive" } } },
          { contact: { lastName: { contains: query, mode: "insensitive" } } },
          { contact: { email: { contains: query, mode: "insensitive" } } },
          { confirmationCode: { contains: query, mode: "insensitive" } },
        ],
      },
      include: {
        contact: true,
        checkIns: {
          orderBy: { checkInTime: "desc" },
          take: 1,
        },
      },
      take: limit,
    });
  },

  /**
   * Get check-in statistics for an event
   */
  async getStats(eventId: string) {
    const [totalRegistrations, checkedIn, checkInsByHour, checkInsByLocation] =
      await Promise.all([
        // Total confirmed registrations
        prisma.registration.count({
          where: { eventId, status: "CONFIRMED" },
        }),

        // Unique checked-in registrations (distinct registrationId)
        prisma.checkIn.groupBy({
          by: ["registrationId"],
          where: {
            eventId,
            checkOutTime: null, // Still checked in
          },
        }),

        // Check-ins by hour (last 24 hours)
        prisma.$queryRaw<{ hour: Date; count: bigint }[]>`
          SELECT DATE_TRUNC('hour', "checkInTime") as hour, COUNT(*) as count
          FROM "CheckIn"
          WHERE "eventId" = ${eventId}
            AND "checkInTime" > NOW() - INTERVAL '24 hours'
          GROUP BY DATE_TRUNC('hour', "checkInTime")
          ORDER BY hour
        `,

        // Check-ins by location
        prisma.checkIn.groupBy({
          by: ["location"],
          where: { eventId, location: { not: null } },
          _count: true,
        }),
      ]);

    return {
      totalRegistrations,
      checkedIn: checkedIn.length,
      remaining: totalRegistrations - checkedIn.length,
      checkInRate:
        totalRegistrations > 0
          ? Math.round((checkedIn.length / totalRegistrations) * 100)
          : 0,
      checkInsByHour: checkInsByHour.map((h) => ({
        hour: h.hour,
        count: Number(h.count),
      })),
      checkInsByLocation: checkInsByLocation.map((l) => ({
        location: l.location || "Unknown",
        count: l._count,
      })),
    };
  },

  /**
   * Get recent check-ins
   */
  async getRecentCheckIns(eventId: string, limit = 20) {
    return prisma.checkIn.findMany({
      where: { eventId },
      include: {
        registration: {
          include: {
            contact: true,
          },
        },
      },
      orderBy: { checkInTime: "desc" },
      take: limit,
    });
  },

  /**
   * Get all check-ins for an event (for export)
   */
  async getAllCheckIns(eventId: string) {
    return prisma.checkIn.findMany({
      where: { eventId },
      include: {
        registration: {
          include: {
            contact: true,
          },
        },
      },
      orderBy: { checkInTime: "asc" },
    });
  },

  /**
   * Check-in points management
   */
  async getCheckInPoints(eventId: string) {
    return prisma.checkInPoint.findMany({
      where: { eventId },
      orderBy: { name: "asc" },
    });
  },

  async createCheckInPoint(eventId: string, data: { name: string; nameAr?: string }) {
    return prisma.checkInPoint.create({
      data: { eventId, ...data },
    });
  },

  async updateCheckInPoint(
    id: string,
    data: { name?: string; nameAr?: string; isActive?: boolean }
  ) {
    return prisma.checkInPoint.update({
      where: { id },
      data,
    });
  },

  async deleteCheckInPoint(id: string) {
    return prisma.checkInPoint.delete({ where: { id } });
  },
};
