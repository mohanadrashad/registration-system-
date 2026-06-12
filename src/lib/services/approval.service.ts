import { prisma } from "@/lib/prisma";
import { Prisma, RegistrationStatus } from "@prisma/client";
import { emailService } from "./email.service";

// Capacity reads accept either the singleton client or an interactive-
// transaction client, so capacity decisions can run under lockEventRow
// inside the same transaction that writes the registration.
type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Approval Workflow Service
 * Handles registration approvals and waitlist management
 */
export const approvalService = {
  /**
   * Serialize capacity decisions for one event: take a Postgres row lock
   * on the Event row for the duration of the surrounding transaction.
   * Any check-then-write capacity logic (register, approve, promote) that
   * runs after this call inside the same transaction cannot race another
   * request for the same event — the second request waits on the lock and
   * then sees the first one's committed counts.
   */
  async lockEventRow(tx: Prisma.TransactionClient, eventId: string) {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`;
  },

  /**
   * Get event capacity info
   */
  async getCapacityInfo(eventId: string, db: DbClient = prisma) {
    const event = await db.event.findUnique({
      where: { id: eventId },
      include: { modules: true },
    });

    if (!event) return null;

    const grouped = await db.registration.groupBy({
      by: ["status"],
      where: {
        eventId,
        status: { in: ["CONFIRMED", "PENDING_APPROVAL", "WAITLISTED"] },
      },
      _count: { _all: true },
    });
    const countOf = (status: RegistrationStatus) =>
      grouped.find((g) => g.status === status)?._count._all ?? 0;

    const confirmedCount = countOf("CONFIRMED");

    return {
      capacity: event.capacity,
      confirmed: confirmedCount,
      pendingApproval: countOf("PENDING_APPROVAL"),
      waitlisted: countOf("WAITLISTED"),
      available: event.capacity ? Math.max(0, event.capacity - confirmedCount) : null,
      isAtCapacity: event.capacity ? confirmedCount >= event.capacity : false,
      approvalRequired: event.modules?.approvalWorkflow || false,
      waitlistEnabled: event.modules?.waitlist || false,
    };
  },

  /**
   * Determine registration status based on event settings
   */
  async determineRegistrationStatus(
    eventId: string,
    db: DbClient = prisma
  ): Promise<RegistrationStatus> {
    const capacityInfo = await this.getCapacityInfo(eventId, db);
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
   * Recent approval / rejection decisions for an event. Powers the
   * "Recent Decisions" tab on the approvals dashboard (Stage 4 of
   * ADMIN_EDIT_FIX_SPEC).
   *
   * Filters to rows where either `approvedAt` or `rejectedAt` is
   * non-null — so legacy pre-Stage-1 rows (where these columns are
   * null even though the registration may have been approved at
   * some point) don't appear. That's intentional: the audit display
   * is about decisions we have a record of, not all REGISTERED rows.
   *
   * Sort: newest decision first via coalesce(approvedAt, rejectedAt).
   * Prisma can't express coalesce in orderBy directly; we sort by
   * approvedAt desc then rejectedAt desc and merge client-side
   * inside the consumer (cheap at limit=100). Wait — actually the
   * simpler answer is to fetch both with the cap, then sort the
   * unified array by the relevant timestamp in JS. Done here so the
   * route handler stays trivial.
   *
   * Cap: 100 most recent. Hits the typical Productive-Families
   * scale without pagination. The route surfaces `totalRecent` so
   * the UI can render "Showing 100 most recent decisions" only when
   * the full count exceeds the cap.
   */
  async getRecentDecisions(eventId: string, limit: number = 100) {
    const [decisions, totalRecent] = await Promise.all([
      prisma.registration.findMany({
        where: {
          eventId,
          OR: [
            { approvedAt: { not: null } },
            { rejectedAt: { not: null } },
          ],
        },
        include: {
          contact: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          approver: { select: { id: true, name: true, email: true } },
          rejecter: { select: { id: true, name: true, email: true } },
        },
        // Sort by approvedAt desc THEN rejectedAt desc — gets us most
        // entries in the right relative order. Final unified ordering
        // happens client-side below.
        orderBy: [
          { approvedAt: "desc" },
          { rejectedAt: "desc" },
        ],
        take: limit,
      }),
      prisma.registration.count({
        where: {
          eventId,
          OR: [
            { approvedAt: { not: null } },
            { rejectedAt: { not: null } },
          ],
        },
      }),
    ]);

    // Unify by the effective decision timestamp (whichever is
    // non-null and most recent on the row). Approve-then-reject
    // shouldn't happen in practice, but if it does the most-recent
    // wins.
    const sorted = [...decisions].sort((a, b) => {
      const ta = decisionTimestamp(a);
      const tb = decisionTimestamp(b);
      return (tb ?? 0) - (ta ?? 0);
    });

    return { decisions: sorted, totalRecent };
  },

  /**
   * Approve a registration
   */
  async approve(registrationId: string, approvedBy?: string) {
    return prisma.$transaction(async (tx) => {
      // Resolve the event first so the capacity lock can be taken, then
      // re-read the registration under the lock — a concurrent approve of
      // the same row (or of a sibling consuming the last spot) waits on
      // lockEventRow and then sees this transaction's outcome.
      const target = await tx.registration.findUnique({
        where: { id: registrationId },
        select: { eventId: true },
      });
      if (!target) {
        return { success: false as const, error: "Registration not found" };
      }
      await this.lockEventRow(tx, target.eventId);

      const registration = await tx.registration.findUnique({
        where: { id: registrationId },
        include: {
          contact: true,
          event: true,
        },
      });

      if (!registration) {
        return { success: false as const, error: "Registration not found" };
      }

      if (registration.status !== "PENDING_APPROVAL") {
        return {
          success: false as const,
          error: "Registration is not pending approval",
        };
      }

      // Check capacity
      const capacityInfo = await this.getCapacityInfo(registration.eventId, tx);
      if (capacityInfo?.isAtCapacity) {
        return { success: false as const, error: "Event is at capacity" };
      }

      // Update registration. Persist approval audit columns (Stage 1 of
      // ADMIN_EDIT_FIX_SPEC): approvedBy, approvedAt, and updatedBy all
      // point at the actor. Approver-relation form is required by Prisma's
      // checked-input typing (raw FK column lives on the unchecked variant).
      const updated = await tx.registration.update({
        where: { id: registrationId },
        data: {
          status: "CONFIRMED",
          registeredAt: new Date(),
          ...(approvedBy
            ? {
                approvedAt: new Date(),
                approver: { connect: { id: approvedBy } },
                updater: { connect: { id: approvedBy } },
              }
            : {}),
        },
        include: {
          contact: true,
          event: true,
        },
      });

      // Update contact status
      await tx.contact.update({
        where: { id: registration.contactId },
        data: {
          status: "REGISTERED",
          ...(approvedBy
            ? { updater: { connect: { id: approvedBy } } }
            : {}),
        },
      });

      // TODO: Send approval email
      // await emailService.sendApprovalEmail(registrationId);

      return { success: true as const, registration: updated };
    });
  },

  /**
   * Reject a registration
   */
  async reject(registrationId: string, reason?: string, rejectedBy?: string) {
    return prisma.$transaction(async (tx) => {
      const registration = await tx.registration.findUnique({
        where: { id: registrationId },
        include: {
          contact: true,
          event: true,
        },
      });

      if (!registration) {
        return { success: false as const, error: "Registration not found" };
      }

      if (registration.status !== "PENDING_APPROVAL") {
        return {
          success: false as const,
          error: "Registration is not pending approval",
        };
      }

      // Update registration. Persist rejection audit columns: rejectedBy,
      // rejectedAt, rejectionReason, and updatedBy. The reason is stored
      // even when empty/null is passed — null is the absence of a reason,
      // not a value worth normalizing away. Rejecter-relation form per
      // Prisma checked-input typing.
      const updated = await tx.registration.update({
        where: { id: registrationId },
        data: {
          status: "CANCELLED",
          ...(rejectedBy
            ? {
                rejectedAt: new Date(),
                rejectionReason: reason ?? null,
                rejecter: { connect: { id: rejectedBy } },
                updater: { connect: { id: rejectedBy } },
              }
            : {}),
        },
        include: {
          contact: true,
          event: true,
        },
      });

      // Update contact status
      await tx.contact.update({
        where: { id: registration.contactId },
        data: {
          status: "CANCELLED",
          ...(rejectedBy
            ? { updater: { connect: { id: rejectedBy } } }
            : {}),
        },
      });

      // TODO: Send rejection email with reason
      // await emailService.sendRejectionEmail(registrationId, reason);

      return { success: true as const, registration: updated };
    });
  },

  /**
   * Promote next person from waitlist
   */
  async promoteFromWaitlist(eventId: string, actorId?: string) {
    return prisma.$transaction(async (tx) => {
      // Lock first: two concurrent promotes (or a promote racing an
      // approve) must not both see the same free spot — or the same
      // next-in-line row.
      await this.lockEventRow(tx, eventId);

      // Get first person on waitlist
      const nextInLine = await tx.registration.findFirst({
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
        return { success: false as const, error: "No one on waitlist" };
      }

      // Check capacity
      const capacityInfo = await this.getCapacityInfo(eventId, tx);
      if (capacityInfo?.isAtCapacity) {
        return { success: false as const, error: "Event is still at capacity" };
      }

      // Determine new status based on approval workflow
      const newStatus = capacityInfo?.approvalRequired ? "PENDING_APPROVAL" : "CONFIRMED";

      // Update registration. Stamp updatedBy when the route plumbs an
      // actorId through (admin-triggered promotion); leave it null on
      // any future automated promotion path.
      const updated = await tx.registration.update({
        where: { id: nextInLine.id },
        data: {
          status: newStatus,
          registeredAt: newStatus === "CONFIRMED" ? new Date() : null,
          ...(actorId ? { updater: { connect: { id: actorId } } } : {}),
        },
        include: {
          contact: true,
          event: true,
        },
      });

      // Update contact status if confirmed
      if (newStatus === "CONFIRMED") {
        await tx.contact.update({
          where: { id: nextInLine.contactId },
          data: {
            status: "REGISTERED",
            ...(actorId ? { updater: { connect: { id: actorId } } } : {}),
          },
        });
      }

      // TODO: Send notification email
      // await emailService.sendWaitlistPromotionEmail(nextInLine.id);

      return { success: true as const, registration: updated, status: newStatus };
    });
  },

  /**
   * Cancel a confirmed registration and promote from waitlist
   */
  async cancelAndPromote(registrationId: string, actorId?: string) {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        event: { include: { modules: true } },
      },
    });

    if (!registration) {
      return { success: false, error: "Registration not found" };
    }

    // Cancel the registration. Stamp updatedBy on both rows when an
    // actor is provided. The cascade promotion below also receives
    // actorId so the promoted attendee's audit trail credits the same
    // admin who triggered the cancel — one logical action, one actor.
    await prisma.registration.update({
      where: { id: registrationId },
      data: {
        status: "CANCELLED",
        ...(actorId ? { updater: { connect: { id: actorId } } } : {}),
      },
    });

    await prisma.contact.update({
      where: { id: registration.contactId },
      data: {
        status: "CANCELLED",
        ...(actorId ? { updater: { connect: { id: actorId } } } : {}),
      },
    });

    // If waitlist is enabled, promote next person
    if (registration.event.modules?.waitlist) {
      const result = await this.promoteFromWaitlist(registration.eventId, actorId);
      return {
        success: true,
        cancelled: registrationId,
        promoted: result.success ? result.registration : null,
      };
    }

    return { success: true, cancelled: registrationId, promoted: null };
  },
};

/**
 * Pick the most recent decision timestamp on a registration row.
 * Returns null only if both columns are null — getRecentDecisions
 * filters those out at the DB layer, so callers from that path get
 * a non-null. Module-local because it's an implementation detail
 * of the unified-ordering pass in getRecentDecisions.
 */
function decisionTimestamp(reg: {
  approvedAt: Date | null;
  rejectedAt: Date | null;
}): number | null {
  const a = reg.approvedAt?.getTime() ?? null;
  const r = reg.rejectedAt?.getTime() ?? null;
  if (a === null && r === null) return null;
  if (a === null) return r;
  if (r === null) return a;
  return Math.max(a, r);
}
