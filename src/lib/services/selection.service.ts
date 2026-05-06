import { prisma } from "@/lib/prisma";
import type { PhaseOption } from "@prisma/client";
import { Prisma } from "@prisma/client";

// ─── Option CRUD ──────────────────────────────────────────────────────

// Mirror of the Zod-validated shape from src/lib/validations/selection.ts
// after parsing — kept in service-land so the route is the only place that
// touches Zod, and the service stays framework-agnostic.
export type OptionInput = {
  label: string;
  labelAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  externalUrl?: string | null;
  capacity?: number | null;
  metadata?: Record<string, string> | null;
  // 3-state: true = always require receipt for this option, false = never,
  // null = inherit from Phase.requiresReceiptUpload, undefined = leave alone.
  requiresReceipt?: boolean | null;
  isActive?: boolean;
};

export async function listOptionsForPhase(phaseId: string) {
  return prisma.phaseOption.findMany({
    where: { phaseId },
    orderBy: { order: "asc" },
    include: { _count: { select: { selections: true } } },
  });
}

export async function createOption(
  phaseId: string,
  input: OptionInput
): Promise<PhaseOption> {
  // Pick next order number after the highest existing option for this phase.
  // @@unique([phaseId, order]) makes "current count" unsafe if rows have been
  // deleted out of the middle, so we pull the actual max.
  const last = await prisma.phaseOption.findFirst({
    where: { phaseId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const order = (last?.order ?? -1) + 1;

  const metadata = normaliseMetadata(input.metadata);
  return prisma.phaseOption.create({
    data: {
      phaseId,
      label: input.label,
      labelAr: input.labelAr ?? null,
      description: input.description ?? null,
      descriptionAr: input.descriptionAr ?? null,
      externalUrl: normaliseUrl(input.externalUrl),
      capacity: input.capacity ?? null,
      // Prisma requires `JsonNull` rather than `null` for nullable Json columns.
      metadata: metadata ?? Prisma.JsonNull,
      requiresReceipt: input.requiresReceipt ?? null,
      isActive: input.isActive ?? true,
      order,
    },
  });
}

export async function updateOption(
  optionId: string,
  input: Partial<OptionInput>
): Promise<PhaseOption> {
  // `metadata` and `requiresReceipt` are 3-state: presence with `null` should
  // clear the column, while `undefined` should leave it alone. The spread
  // pattern below mirrors phase.service.updatePhase.
  const data: Prisma.PhaseOptionUpdateInput = {
    ...(input.label !== undefined && { label: input.label }),
    ...(input.labelAr !== undefined && { labelAr: input.labelAr }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.descriptionAr !== undefined && {
      descriptionAr: input.descriptionAr,
    }),
    ...(input.externalUrl !== undefined && {
      externalUrl: normaliseUrl(input.externalUrl),
    }),
    ...(input.capacity !== undefined && { capacity: input.capacity }),
    ...(input.metadata !== undefined && {
      metadata:
        normaliseMetadata(input.metadata) ?? Prisma.JsonNull,
    }),
    ...(input.requiresReceipt !== undefined && {
      requiresReceipt: input.requiresReceipt,
    }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
  };
  return prisma.phaseOption.update({ where: { id: optionId }, data });
}

/**
 * Delete an option. Guard: cannot delete an option that any attendee has
 * already selected. The route surfaces this as a 409 with the live count
 * so the UI can show the "X attendees selected this — deactivate instead"
 * dialog. Bulk-reassignment ships in Stage 5.
 */
export async function deleteOption(optionId: string): Promise<void> {
  const option = await prisma.phaseOption.findUnique({
    where: { id: optionId },
    include: { _count: { select: { selections: true } } },
  });
  if (!option) throw new OptionNotFoundError();
  if (option._count.selections > 0) {
    throw new OptionInUseError(option._count.selections);
  }
  await prisma.phaseOption.delete({ where: { id: optionId } });
}

export async function reorderOption(
  phaseId: string,
  optionId: string,
  direction: "up" | "down"
): Promise<void> {
  const options = await prisma.phaseOption.findMany({
    where: { phaseId },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });
  const idx = options.findIndex((o) => o.id === optionId);
  if (idx === -1) throw new OptionNotFoundError();
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= options.length) return; // already at the edge
  const a = options[idx];
  const b = options[swapIdx];
  // Three-step swap via temp: @@unique([phaseId, order]) rejects a direct
  // two-step swap because both rows would briefly share an order value.
  // Same pattern as reorderPhase / reorderStep.
  const TEMP = -1;
  await prisma.$transaction([
    prisma.phaseOption.update({ where: { id: a.id }, data: { order: TEMP } }),
    prisma.phaseOption.update({ where: { id: b.id }, data: { order: a.order } }),
    prisma.phaseOption.update({ where: { id: a.id }, data: { order: b.order } }),
  ]);
}

// ─── Errors ───────────────────────────────────────────────────────────

export class OptionNotFoundError extends Error {
  readonly code = "OPTION_NOT_FOUND";
  constructor() {
    super("Phase option not found.");
  }
}

export class OptionInUseError extends Error {
  readonly code = "OPTION_HAS_SELECTIONS";
  constructor(public readonly selectionCount: number) {
    super(
      `Cannot delete an option that has been selected by ${selectionCount} attendee(s). ` +
        "Deactivate the option instead, or reassign the attendees first."
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function normaliseUrl(url: string | null | undefined): string | null {
  if (url === undefined) return null;
  if (url === null) return null;
  const trimmed = url.trim();
  return trimmed === "" ? null : trimmed;
}

function normaliseMetadata(
  metadata: Record<string, string> | null | undefined
): Record<string, string> | null {
  if (!metadata) return null;
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata)) {
    const key = k.trim();
    if (!key) continue;
    cleaned[key] = v;
  }
  return Object.keys(cleaned).length === 0 ? null : cleaned;
}
