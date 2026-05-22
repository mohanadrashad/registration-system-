/**
 * Auto-reminder dispatcher for post-registration phases.
 *
 * Runs from a Vercel Cron job hitting /api/cron/phase-reminders. For every
 * post-reg phase whose `opensAt` has just passed and that has a configured
 * `reminderTemplateId`, fan out the linked email template to each
 * registered attendee who hasn't yet submitted that phase.
 *
 * The phase row's `reminderSent` flag is the idempotency latch. Setting it
 * to true at the START of processing means a second cron tick that
 * overlaps with the first will skip — at the cost of the rare scenario
 * where the first run crashes mid-batch and some attendees miss the email.
 * That's the right trade-off: duplicate reminder emails are worse than
 * the occasional missed one (which an admin can always resend manually).
 */
import { prisma } from "@/lib/prisma";
import { emailService } from "@/lib/services/email.service";
import { getEventBaseUrl } from "@/lib/urls";
import { SYNTHETIC_EMAIL_DOMAIN } from "@/lib/contact/synthetic-email";

export interface PhaseReminderResult {
  phasesProcessed: number;
  emailsAttempted: number;
  emailsSent: number;
  emailsFailed: number;
  details: Array<{
    phaseId: string;
    eventId: string;
    attempted: number;
    sent: number;
    failed: number;
  }>;
}

export async function runPhaseReminders(
  now: Date = new Date()
): Promise<PhaseReminderResult> {
  const result: PhaseReminderResult = {
    phasesProcessed: 0,
    emailsAttempted: 0,
    emailsSent: 0,
    emailsFailed: 0,
    details: [],
  };

  // Phases ready for reminder dispatch:
  //   - POST_REGISTRATION, active, has a template, hasn't fired yet
  //   - opensAt is in the past (NULL "always-open" phases never trigger
  //     auto-reminders — they were available since the day they were created)
  //   - parent event has the postRegPhases module on
  const phases = await prisma.phase.findMany({
    where: {
      type: "POST_REGISTRATION",
      isActive: true,
      reminderSent: false,
      reminderTemplateId: { not: null },
      opensAt: { not: null, lte: now },
      event: {
        isActive: true,
        modules: { is: { postRegPhases: true } },
      },
    },
    select: {
      id: true,
      eventId: true,
      title: true,
      reminderTemplateId: true,
    },
  });

  for (const phase of phases) {
    if (!phase.reminderTemplateId) continue;

    // Latch BEFORE sending so a concurrent tick won't double-fire.
    // updateMany with the same `reminderSent: false` predicate gives us
    // a row-level CAS — if the count returns 0, another worker already
    // claimed this phase and we skip cleanly.
    const claim = await prisma.phase.updateMany({
      where: { id: phase.id, reminderSent: false },
      data: { reminderSent: true },
    });
    if (claim.count === 0) continue;

    const detail = {
      phaseId: phase.id,
      eventId: phase.eventId,
      attempted: 0,
      sent: 0,
      failed: 0,
    };

    try {
      // Eligible recipients: registrations on this event that:
      //   - are confirmed (active attendees)
      //   - have a contact with a non-synthetic email
      //   - have NOT yet submitted this phase
      //   - do NOT have a LOCKED override on this phase (force-locked
      //     attendees are blocked from filling, no point reminding them)
      const recipients = await prisma.registration.findMany({
        where: {
          eventId: phase.eventId,
          status: "CONFIRMED",
          contact: {
            email: { not: { endsWith: `@${SYNTHETIC_EMAIL_DOMAIN}` } },
          },
          phaseSubmissions: { none: { phaseId: phase.id } },
          phaseAccess: { none: { phaseId: phase.id, status: "LOCKED" } },
        },
        select: { id: true, contactId: true },
      });

      const baseUrl = await getEventBaseUrl(phase.eventId);

      for (const reg of recipients) {
        detail.attempted++;
        result.emailsAttempted++;

        try {
          const sendResult = await emailService.sendToContact({
            contactId: reg.contactId,
            templateId: phase.reminderTemplateId,
            variables: {
              phaseTitle: phase.title,
              portalUrl: `${baseUrl}/portal`,
            },
          });
          if (sendResult.success) {
            detail.sent++;
            result.emailsSent++;
          } else {
            detail.failed++;
            result.emailsFailed++;
          }
        } catch (err) {
          // sendToContact throws only on missing contact/template — both
          // would mean a bad config, log and move on rather than abort
          // the whole run.
          console.error(
            `[phase-reminders] send failed for phase=${phase.id} contact=${reg.contactId}:`,
            err
          );
          detail.failed++;
          result.emailsFailed++;
        }
      }
    } finally {
      result.phasesProcessed++;
      result.details.push(detail);
    }
  }

  return result;
}
