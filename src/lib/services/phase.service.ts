import { prisma } from "@/lib/prisma";
import type {
  Step,
  Phase,
  AccessStatus,
  PhaseAccess,
  PhaseSelectionMode,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { assertSelectionModeAllowed } from "@/lib/validations/selection";

// ─── Status calculation ────────────────────────────────────────────────

export type PhaseStatus = "LOCKED" | "NOT_OPEN" | "OPEN" | "CLOSED";

/**
 * Decide whether an attendee can fill a post-registration phase right
 * now. Admin override (PhaseAccess) wins over the date-based default.
 */
export function computePhaseStatus(
  phase: { opensAt: Date | null; closesAt: Date | null },
  override: AccessStatus | null,
  now: Date = new Date()
): PhaseStatus {
  if (override === "LOCKED") return "LOCKED";
  if (override === "OPEN") return "OPEN";
  if (phase.opensAt && now.getTime() < phase.opensAt.getTime()) return "NOT_OPEN";
  if (phase.closesAt && now.getTime() > phase.closesAt.getTime()) return "CLOSED";
  return "OPEN";
}

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

// ─── Listing ────────────────────────────────────────────────────────────

export async function listPhasesForEvent(eventId: string) {
  return prisma.phase.findMany({
    where: { eventId },
    orderBy: { order: "asc" },
    include: {
      steps: {
        orderBy: { order: "asc" },
        include: {
          fields: { orderBy: { order: "asc" } },
        },
      },
      reminderTemplate: { select: { id: true, name: true } },
      // Stage 2: include selectable options. _count.selections lets the
      // form-builder show the delete-guard count without a separate fetch.
      options: {
        orderBy: { order: "asc" },
        include: { _count: { select: { selections: true } } },
      },
    },
  });
}

// ─── Phase CRUD ─────────────────────────────────────────────────────────

export type CreatePhaseInput = {
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  opensAt?: Date | null;
  closesAt?: Date | null;
  isRequired?: boolean;
  reminderTemplateId?: string | null;
  // Per-category visibility. Empty/omitted = visible to everyone.
  appliesToCategories?: string[];
};

export async function createPostRegistrationPhase(
  eventId: string,
  input: CreatePhaseInput
): Promise<Phase> {
  // Pick next order number after the highest existing phase.
  const last = await prisma.phase.findFirst({
    where: { eventId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = (last?.order ?? -1) + 1;

  return prisma.phase.create({
    data: {
      eventId,
      type: "POST_REGISTRATION",
      title: input.title,
      titleAr: input.titleAr ?? null,
      description: input.description ?? null,
      descriptionAr: input.descriptionAr ?? null,
      opensAt: input.opensAt ?? null,
      closesAt: input.closesAt ?? null,
      isRequired: input.isRequired ?? false,
      reminderTemplateId: input.reminderTemplateId ?? null,
      order,
      steps: {
        // Every phase needs at least one step.
        create: { title: "Details", titleAr: "التفاصيل", order: 0 },
      },
    },
  });
}

export type UpdatePhaseInput = Partial<CreatePhaseInput> & {
  isActive?: boolean;
  // Stage 2 selection fields. Patched alongside the base fields in one call.
  // REGISTRATION phases are not allowed to enable selection — guarded below.
  selectionMode?: PhaseSelectionMode;
  maxSelections?: number;
  allowChangeAfterSubmit?: boolean;
  requiresReceiptUpload?: boolean;
};

export async function updatePhase(
  phaseId: string,
  input: UpdatePhaseInput,
  expectedUpdatedAt: Date | null = null
): Promise<Phase> {
  const data: Prisma.PhaseUpdateInput = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.titleAr !== undefined && { titleAr: input.titleAr }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.descriptionAr !== undefined && {
      descriptionAr: input.descriptionAr,
    }),
    ...(input.opensAt !== undefined && { opensAt: input.opensAt }),
    ...(input.closesAt !== undefined && { closesAt: input.closesAt }),
    ...(input.isRequired !== undefined && { isRequired: input.isRequired }),
    ...(input.reminderTemplateId !== undefined && {
      reminderTemplateId: input.reminderTemplateId,
    }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
    ...(input.selectionMode !== undefined && {
      selectionMode: input.selectionMode,
    }),
    ...(input.maxSelections !== undefined && {
      maxSelections: input.maxSelections,
    }),
    ...(input.allowChangeAfterSubmit !== undefined && {
      allowChangeAfterSubmit: input.allowChangeAfterSubmit,
    }),
    ...(input.requiresReceiptUpload !== undefined && {
      requiresReceiptUpload: input.requiresReceiptUpload,
    }),
    ...(input.appliesToCategories !== undefined && {
      appliesToCategories: { set: input.appliesToCategories },
    }),
  };

  // Two checks fold cleanly into a single transaction when the caller
  // supplied the updatedAt it last saw: (1) phase still exists and isn't
  // a REGISTRATION row that's getting selectionMode flipped on, and
  // (2) nobody else has saved a newer version of the row.
  if (expectedUpdatedAt || input.selectionMode !== undefined) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.phase.findUnique({
        where: { id: phaseId },
        select: { type: true, updatedAt: true },
      });
      if (!existing) throw new PhaseNotFoundError();
      if (input.selectionMode !== undefined) {
        assertSelectionModeAllowed(existing.type, input.selectionMode);
      }
      if (
        expectedUpdatedAt &&
        existing.updatedAt.getTime() > expectedUpdatedAt.getTime()
      ) {
        throw new PhaseConcurrencyError(existing.updatedAt);
      }
      return tx.phase.update({ where: { id: phaseId }, data });
    });
  }

  return prisma.phase.update({ where: { id: phaseId }, data });
}

export class PhaseNotFoundError extends Error {
  readonly code = "PHASE_NOT_FOUND";
  constructor() {
    super("Phase not found.");
  }
}

/**
 * Thrown by updatePhase when the caller's expectedUpdatedAt is older than
 * the row's current updatedAt — i.e., someone else (another tab, another
 * admin) saved a newer version. Routes map this to a 409 carrying the
 * current updatedAt so the client can refetch + reconcile.
 */
export class PhaseConcurrencyError extends Error {
  readonly code = "PHASE_CONCURRENCY";
  constructor(public readonly currentUpdatedAt: Date) {
    super(
      "This phase was changed by someone else since you last loaded it. " +
        "Reload to see the latest version, then re-apply your edit."
    );
  }
}

export async function reorderPhase(
  eventId: string,
  phaseId: string,
  direction: "up" | "down"
): Promise<void> {
  // Pull all phases for the event in current order; swap the target with its
  // neighbour. REGISTRATION (order 0) is pinned and cannot move.
  const phases = await prisma.phase.findMany({
    where: { eventId },
    orderBy: { order: "asc" },
    select: { id: true, order: true, type: true },
  });
  const idx = phases.findIndex((p) => p.id === phaseId);
  if (idx === -1) throw new Error("Phase not found on this event");
  if (phases[idx].type === "REGISTRATION") {
    throw new Error("REGISTRATION phase cannot be reordered");
  }
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= phases.length) return; // already at edge
  if (phases[swapIdx].type === "REGISTRATION") return; // can't swap past it
  const a = phases[idx];
  const b = phases[swapIdx];
  // Three-step swap via a temp value, because @@unique([eventId, order])
  // would reject a direct swap (both rows would briefly hold the same order).
  const TEMP = -1;
  await prisma.$transaction([
    prisma.phase.update({ where: { id: a.id }, data: { order: TEMP } }),
    prisma.phase.update({ where: { id: b.id }, data: { order: a.order } }),
    prisma.phase.update({ where: { id: a.id }, data: { order: b.order } }),
  ]);
}

/**
 * Delete a phase. Throws if any deletion guard fails:
 *   - REGISTRATION phase cannot be deleted.
 *   - Phase containing any step that has any field cannot be deleted.
 */
export async function deletePhase(phaseId: string): Promise<void> {
  const phase = await prisma.phase.findUnique({
    where: { id: phaseId },
    include: {
      steps: {
        include: { _count: { select: { fields: true } } },
      },
    },
  });
  if (!phase) throw new Error("Phase not found");
  if (phase.type === "REGISTRATION") {
    throw new Error("The Registration phase cannot be deleted.");
  }
  const totalFields = phase.steps.reduce(
    (sum, s) => sum + s._count.fields,
    0
  );
  if (totalFields > 0) {
    throw new Error(
      `This phase contains ${totalFields} field(s). Move or delete them before deleting the phase.`
    );
  }
  await prisma.phase.delete({ where: { id: phaseId } });
}

// ─── Step CRUD ──────────────────────────────────────────────────────────

export type CreateStepInput = {
  title: string;
  titleAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
};

export async function createStep(
  phaseId: string,
  input: CreateStepInput
): Promise<Step> {
  const last = await prisma.step.findFirst({
    where: { phaseId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = (last?.order ?? -1) + 1;
  return prisma.step.create({
    data: {
      phaseId,
      title: input.title,
      titleAr: input.titleAr ?? null,
      description: input.description ?? null,
      descriptionAr: input.descriptionAr ?? null,
      order,
    },
  });
}

export type UpdateStepInput = Partial<CreateStepInput>;

export async function updateStep(
  stepId: string,
  input: UpdateStepInput
): Promise<Step> {
  return prisma.step.update({
    where: { id: stepId },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.titleAr !== undefined && { titleAr: input.titleAr }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.descriptionAr !== undefined && {
        descriptionAr: input.descriptionAr,
      }),
    },
  });
}

export async function reorderStep(
  phaseId: string,
  stepId: string,
  direction: "up" | "down"
): Promise<void> {
  const steps = await prisma.step.findMany({
    where: { phaseId },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });
  const idx = steps.findIndex((s) => s.id === stepId);
  if (idx === -1) throw new Error("Step not found on this phase");
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= steps.length) return;
  const a = steps[idx];
  const b = steps[swapIdx];
  // Three-step swap via temp value: @@unique([phaseId, order]) rejects a
  // direct two-step swap because both rows would briefly share an order.
  const TEMP = -1;
  await prisma.$transaction([
    prisma.step.update({ where: { id: a.id }, data: { order: TEMP } }),
    prisma.step.update({ where: { id: b.id }, data: { order: a.order } }),
    prisma.step.update({ where: { id: a.id }, data: { order: b.order } }),
  ]);
}

/**
 * Delete a step. Throws on guards:
 *   - Cannot delete the last step of a phase.
 *   - Cannot delete a step containing any fields.
 */
export async function deleteStep(stepId: string): Promise<void> {
  const step = await prisma.step.findUnique({
    where: { id: stepId },
    include: {
      _count: { select: { fields: true } },
      phase: { include: { _count: { select: { steps: true } } } },
    },
  });
  if (!step) throw new Error("Step not found");
  if (step._count.fields > 0) {
    throw new Error(
      `This step contains ${step._count.fields} field(s). Move or delete them before deleting the step.`
    );
  }
  if (step.phase._count.steps <= 1) {
    throw new Error("A phase must have at least one step.");
  }
  await prisma.step.delete({ where: { id: stepId } });
}

// ─── Per-attendee phase access overrides ──────────────────────────────

/**
 * List every post-registration phase on the event paired with this
 * registration's override (if any) and the resulting computed status.
 * Drives the admin "Phase Access" UI on the attendee detail page.
 */
export async function listPhaseAccessForRegistration(
  eventId: string,
  registrationId: string,
  attendeeCategory: string | null
) {
  const phases = await prisma.phase.findMany({
    where: { eventId, type: "POST_REGISTRATION" },
    orderBy: { order: "asc" },
    select: {
      id: true,
      title: true,
      titleAr: true,
      opensAt: true,
      closesAt: true,
      isRequired: true,
      appliesToCategories: true,
      accessOverrides: {
        where: { registrationId },
        select: {
          status: true,
          reason: true,
          unlockedAt: true,
          unlockedBy: true,
        },
      },
    },
  });

  const now = new Date();
  return phases
    // Stage 2: per-category visibility. A PhaseAccess override (OPEN or
    // LOCKED) is an explicit per-attendee admin decision and wins over
    // the category filter (open Q5 default).
    .filter((p) => {
      const ov = p.accessOverrides[0]?.status ?? null;
      if (ov === "OPEN" || ov === "LOCKED") return true;
      return (
        p.appliesToCategories.length === 0 ||
        (attendeeCategory != null &&
          p.appliesToCategories.includes(attendeeCategory))
      );
    })
    .map((p) => {
    const override = p.accessOverrides[0] ?? null;
    return {
      id: p.id,
      title: p.title,
      titleAr: p.titleAr,
      opensAt: p.opensAt,
      closesAt: p.closesAt,
      isRequired: p.isRequired,
      override: override?.status ?? null,
      reason: override?.reason ?? null,
      overriddenAt: override?.unlockedAt ?? null,
      overriddenBy: override?.unlockedBy ?? null,
      status: computePhaseStatus(p, override?.status ?? null, now),
    };
  });
}

/**
 * Upsert a per-attendee override on a phase. The override wins over the
 * date-based default in `computePhaseStatus`, which is what the portal
 * GET / PUT routes already key off.
 */
export async function setPhaseAccess(
  phaseId: string,
  registrationId: string,
  status: AccessStatus,
  reason: string | null,
  unlockedBy: string
): Promise<PhaseAccess> {
  return prisma.phaseAccess.upsert({
    where: { phaseId_registrationId: { phaseId, registrationId } },
    create: {
      phaseId,
      registrationId,
      status,
      reason,
      unlockedAt: new Date(),
      unlockedBy,
    },
    update: {
      status,
      reason,
      unlockedAt: new Date(),
      unlockedBy,
    },
  });
}

/**
 * Drop a per-attendee override. Phase status falls back to whatever the
 * date-based default produces (NOT_OPEN / OPEN / CLOSED).
 */
export async function clearPhaseAccess(
  phaseId: string,
  registrationId: string
): Promise<void> {
  await prisma.phaseAccess.deleteMany({
    where: { phaseId, registrationId },
  });
}

// ─── Field move ─────────────────────────────────────────────────────────

/**
 * Move a FormField to a different Step. The target step must belong to a
 * Phase under the same Event as the field — guarded here, not in the
 * route, so the rule lives with the data layer.
 */
export async function moveFieldToStep(
  fieldId: string,
  targetStepId: string
): Promise<void> {
  const field = await prisma.formField.findUnique({
    where: { id: fieldId },
    select: { eventId: true, stepId: true },
  });
  if (!field) throw new Error("Field not found");
  if (field.stepId === targetStepId) return; // no-op

  const target = await prisma.step.findUnique({
    where: { id: targetStepId },
    select: { phase: { select: { eventId: true } } },
  });
  if (!target) throw new Error("Target step not found");
  if (target.phase.eventId !== field.eventId) {
    throw new Error("Cannot move a field to a step on a different event.");
  }

  await prisma.formField.update({
    where: { id: fieldId },
    data: { stepId: targetStepId },
  });
}
