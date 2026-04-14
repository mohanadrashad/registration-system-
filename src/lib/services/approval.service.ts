import { prisma } from "@/lib/prisma";
import { RegistrationStatus } from "@prisma/client";
import { emailService } from "./email.service";

/**
 * Approval Workflow Service
 * Handles registration approvals and waitlist management
 */
export const approvalService = {
  /**
   * Get event capacity info
   */
  async getCapacityInfo(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        modules: true,
        _count: {
          select: {
            registrations: {
              where: {
                status: { in: ["CONFIRMED", "PENDING_APPROVAL"] },
              },
            },
          },
        },
      },
    });

    if (!event) return null;

    const confirmedCount = await prisma.registration.count({
      where: {
        eventId,
        status: "CONFIRMED",
      },
    });

    const pendingApprovalCount = await prisma.registration.count({
      where: {
        eventId,
        status: "PENDING_APPROVAL",
      },
    });

    const waitlistedCount = await prisma.registration.count({
      where: {
        eventId,
        status: "WAITLISTED",
      },
    });

    return {
      capacity: event.capacity,
      confirmed: confirmedCount,
      pendingApproval: pendingApprovalCount,
      waitlisted: waitlistedCount,
      available: event.capacity ? Math.max(0, event.capacity - confirmedCount) : null,
      isAtCapacity: event.capacity ? confirmedCount >= event.capacity : false,
      approvalRequired: event.modules?.approvalWorkflow || false,
      waitlistEnabled: event.modules?.waitlist || false,
    };
  },

  /**
   * Determine registration status based on event settings
   */
  async determineRegistrationStatus(eventId: string): Promise<RegistrationStatus> {
    const capacityInfo = await this.getCapacityInfo(eventId);
    if (!capacityInfo) return "CONFIRMED";

    // If at capacity and waitlist enabled
    if (capacityInfo.isAtCapacity && capacityInfo.waitlistEnabled) {
      return "WAITLISTED";
    }

    // If approval workflow enabled
    if (capacityInfo.approvalRequired) {
      return "PENDING_APPROVAL";
    }

    return "CONFIRMED";
  },

  /**
   * Get pending approval registrations
   */
  async getPendingApprovals(eventId: string) {
    return prisma.registration.findMany({
      where: {
        eventId,
        status: "PENDING_APPROVAL",
      },
      include: {
        contact: true,
      },
      orderBy: { createdAt: "asc" },
    });
  },

  /**
   * Get waitlisted registrations
   */
  async getWaitlist(eventId: string) {
    return prisma.registration.findMany({
      where: {
        eventId,
        status: "WAITLISTED",
      },
      include: {
        contact: true,
      },
      orderBy: { createdAt: "asc" },
    });
  },

  /**
   * Approve a registration
   */
  async approve(registrationId: string, approvedBy?: string) {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        contact: true,
        event: true,
      },
    });

    if (!registration) {
      return { success: false, error: "Registration not found" };
    }

    if (registration.status !== "PENDING_APPROVAL") {
      return { success: false, error: "Registration is not pending approval" };
    }

    // Check capacity
    const capacityInfo = await this.getCapacityInfo(registration.eventId);
    if (capacityInfo?.isAtCapacity) {
      return { success: false, error: "Event is at capacity" };
    }

    // Update registration
    const updated = await prisma.registration.update({
      where: { id: registrationId },
      data: {
        status: "CONFIRMED",
        registeredAt: new Date(),
      },
      include: {
        contact: true,
        event: true,
      },
    });

    // Update contact status
    await prisma.contact.update({
      where: { id: registration.contactId },
      data: { status: "REGISTERED" },
    });

    // TODO: Send approval email
    // await emailService.sendApprovalEmail(registrationId);

    return { success: true, registration: updated };
  },

  /**
   * Reject a registration
   */
  async reject(registrationId: string, reason?: string, rejectedBy?: string) {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        contact: true,
        event: true,
      },
    });

    if (!registration) {
      return { success: false, error: "Registration not found" };
    }

    if (registration.status !== "PENDING_APPROVAL") {
      return { success: false, error: "Registration is not pending approval" };
    }

    // Update registration
    const updated = await prisma.registration.update({
      where: { id: registrationId },
      data: {
        status: "CANCELLED",
      },
      include: {
        contact: true,
        event: true,
      },
    });

    // Update contact status
    await prisma.contact.update({
      where: { id: registration.contactId },
      data: { status: "CANCELLED" },
    });

    // TODO: Send rejection email with reason
    // await emailService.sendRejectionEmail(registrationId, reason);

    return { success: true, registration: updated };
  },

  /**
   * Promote next person from waitlist
   */
  async promoteFromWaitlist(eventId: string) {
    // Get first person on waitlist
    const nextInLine = await prisma.registration.findFirst({
      where: {
        eventId,
        status: "WAITLISTED",
      },
      orderBy: { createdAt: "asc" },
      include: {
        contact: true,
        event: {
          include: { modules: true },
        },
      },
    });

    if (!nextInLine) {
      return { success: false, error: "No one on waitlist" };
    }

    // Check capacity
    const capacityInfo = await this.getCapacityInfo(eventId);
    if (capacityInfo?.isAtCapacity) {
      return { success: false, error: "Event is still at capacity" };
    }

    // Determine new status based on approval workflow
    const newStatus = capacityInfo?.approvalRequired ? "PENDING_APPROVAL" : "CONFIRMED";

    // Update registration
    const updated = await prisma.registration.update({
      where: { id: nextInLine.id },
      data: {
        status: newStatus,
        registeredAt: newStatus === "CONFIRMED" ? new Date() : null,
      },
      include: {
        contact: true,
        event: true,
      },
    });

    // Update contact status if confirmed
    if (newStatus === "CONFIRMED") {
      await prisma.contact.update({
        where: { id: nextInLine.contactId },
        data: { status: "REGISTERED" },
      });
    }

    // TODO: Send notification email
    // await emailService.sendWaitlistPromotionEmail(nextInLine.id);

    return { success: true, registration: updated, status: newStatus };
  },

  /**
   * Cancel a confirmed registration and promote from waitlist
   */
  async cancelAndPromote(registrationId: string) {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        event: { include: { modules: true } },
      },
    });

    if (!registration) {
      return { success: false, error: "Registration not found" };
    }

    // Cancel the registration
    await prisma.registration.update({
      where: { id: registrationId },
      data: { status: "CANCELLED" },
    });

    await prisma.contact.update({
      where: { id: registration.contactId },
      data: { status: "CANCELLED" },
    });

    // If waitlist is enabled, promote next person
    if (registration.event.modules?.waitlist) {
      const result = await this.promoteFromWaitlist(registration.eventId);
      return {
        success: true,
        cancelled: registrationId,
        promoted: result.success ? result.registration : null,
      };
    }

    return { success: true, cancelled: registrationId, promoted: null };
  },
};
