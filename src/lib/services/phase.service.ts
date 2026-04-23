import { prisma } from "@/lib/prisma";
import type { Step } from "@prisma/client";

/**
 * Return the first Step of the event's REGISTRATION phase. Creates the
 * phase and/or step if missing, so it's safe to call on any event —
 * including freshly-created ones and those migrated via the Stage 1
 * backfill. Idempotent.
 */
export async function getOrCreateDefaultRegistrationStep(
  eventId: string
): Promise<Step> {
  const phase = await prisma.phase.findFirst({
    where: { eventId, type: "REGISTRATION" },
    include: { steps: { orderBy: { order: "asc" }, take: 1 } },
  });

  if (phase && phase.steps[0]) return phase.steps[0];

  if (phase) {
    return prisma.step.create({
      data: {
        phaseId: phase.id,
        title: "Details",
        titleAr: "التفاصيل",
        order: 0,
      },
    });
  }

  const created = await prisma.phase.create({
    data: {
      eventId,
      type: "REGISTRATION",
      title: "Registration",
      titleAr: "التسجيل",
      order: 0,
      steps: {
        create: { title: "Details", titleAr: "التفاصيل", order: 0 },
      },
    },
    include: { steps: { orderBy: { order: "asc" }, take: 1 } },
  });

  return created.steps[0];
}
