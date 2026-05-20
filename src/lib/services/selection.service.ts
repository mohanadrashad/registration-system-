import { prisma } from "@/lib/prisma";
import type {
  AttendeeSelection,
  PhaseOption,
  PhaseSelectionMode,
} from "@prisma/client";
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
  // Category-Phases stage 3 — per-option receipt copy. All four nullable.
  // `undefined` means "leave alone" on PATCH; explicit `null` clears.
  receiptLabel?: string | null;
  receiptInstructions?: string | null;
  receiptLabelAr?: string | null;
  receiptInstructionsAr?: string | null;
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
      receiptLabel: input.receiptLabel ?? null,
      receiptInstructions: input.receiptInstructions ?? null,
      receiptLabelAr: input.receiptLabelAr ?? null,
      receiptInstructionsAr: input.receiptInstructionsAr ?? null,
      isActive: input.isActive ?? true,
      order,
    },
  });
}

export async function updateOption(
  optionId: string,
  input: Partial<OptionInput>,
  expectedUpdatedAt: Date | null = null
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
    ...(input.receiptLabel !== undefined && {
      receiptLabel: input.receiptLabel,
    }),
    ...(input.receiptInstructions !== undefined && {
      receiptInstructions: input.receiptInstructions,
    }),
    ...(input.receiptLabelAr !== undefined && {
      receiptLabelAr: input.receiptLabelAr,
    }),
    ...(input.receiptInstructionsAr !== undefined && {
      receiptInstructionsAr: input.receiptInstructionsAr,
    }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
  };

  // Optimistic concurrency control: if the caller supplied the updatedAt it
  // last saw, we run the read+write in a transaction and refuse the write
  // when the row has moved on (another tab / admin / job edited it). This
  // prevents the classic last-writer-wins data loss when two admins edit
  // the same option in parallel.
  if (expectedUpdatedAt) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.phaseOption.findUnique({
        where: { id: optionId },
        select: { updatedAt: true },
      });
      if (!current) throw new OptionNotFoundError();
      // Compare at the millisecond. We treat "current is strictly newer" as
      // a conflict; equal timestamps mean we're patching the version we saw,
      // which is fine.
      if (current.updatedAt.getTime() > expectedUpdatedAt.getTime()) {
        throw new OptionConcurrencyError(current.updatedAt);
      }
      return tx.phaseOption.update({ where: { id: optionId }, data });
    });
  }

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

/**
 * Thrown by updateOption when the caller's expectedUpdatedAt is older than
 * the row's current updatedAt — i.e., someone else has saved a newer
 * version since the caller last loaded it. The route maps this to a 409
 * with the current updatedAt so the client can refetch and reconcile.
 */
export class OptionConcurrencyError extends Error {
  readonly code = "OPTION_CONCURRENCY";
  constructor(public readonly currentUpdatedAt: Date) {
    super(
      "This option was changed by someone else since you last loaded it. " +
        "Reload to see the latest version, then re-apply your edit."
    );
  }
}

// ─── Stage 4: phase completion calculation ───────────────────────────

export type PhaseCompletionStatus =
  | "NOT_STARTED"
  | "PARTIALLY_COMPLETE"
  | "COMPLETE"
  | "PENDING_ASSIGNMENT";

/**
 * Compute the attendee-facing completion status for a single phase,
 * given the phase shape, the attendee's selections, and whether the
 * field-data submission exists. Matches the spec's four-state model:
 *
 *   NOT_STARTED          no selection, no submission, no receipt
 *   PARTIALLY_COMPLETE   selection made but receipt required & missing
 *   COMPLETE             selections + receipts + fields all done
 *   PENDING_ASSIGNMENT   ADMIN_ASSIGNED phase, admin hasn't assigned yet
 *
 * Required-fields completion is the caller's responsibility — we
 * accept a boolean so the rules stay where the field schema lives
 * (the portal phase GET route already validates these).
 *
 * For non-required phases: a phase is considered COMPLETE if it has
 * any selection AND no unmet receipt requirements AND fields are OK.
 * For required phases: must have `maxSelections` selections.
 */
export function computePhaseCompletion(
  phase: {
    selectionMode: PhaseSelectionMode;
    maxSelections: number;
    isRequired: boolean;
    requiresReceiptUpload: boolean;
  },
  options: Array<{
    id: string;
    requiresReceipt: boolean | null;
  }>,
  selections: Array<{
    optionId: string;
    source: "ADMIN_ASSIGNED" | "ATTENDEE_PICKED";
    receiptFileId: string | null;
  }>,
  fieldsSatisfied: boolean
): PhaseCompletionStatus {
  // Mode-specific short-circuits first.
  if (phase.selectionMode === "ADMIN_ASSIGNED") {
    if (selections.length === 0) return "PENDING_ASSIGNMENT";
    // Admin has assigned. Receipt requirement still applies if the
    // option needs one (rare in this mode but allowed).
    const allReceiptsOk = receiptCheck(phase, options, selections);
    return allReceiptsOk && fieldsSatisfied
      ? "COMPLETE"
      : "PARTIALLY_COMPLETE";
  }

  if (phase.selectionMode === "EXTERNAL_BOOKING") {
    // EXTERNAL_BOOKING: the selection is implicit when the receipt
    // exists. Same completion rules as the others, but the receipt
    // requirement is always on per spec.
    if (selections.length === 0)
      return fieldsSatisfied ? "NOT_STARTED" : "NOT_STARTED";
    const allReceiptsOk = receiptCheck(phase, options, selections);
    return allReceiptsOk && fieldsSatisfied
      ? "COMPLETE"
      : "PARTIALLY_COMPLETE";
  }

  // ATTENDEE_PICKS / MIXED / NONE.
  if (phase.selectionMode === "NONE") {
    // No options at play. Completion = field-data submission state.
    // Caller's fieldsSatisfied + "any selection at all" semantics
    // don't apply since there are no selectable options. Treat as:
    //   fieldsSatisfied + (non-required OR submission exists)
    //   → COMPLETE. Else NOT_STARTED.
    return fieldsSatisfied ? "COMPLETE" : "NOT_STARTED";
  }

  // ATTENDEE_PICKS or MIXED.
  if (selections.length === 0) {
    return fieldsSatisfied ? "NOT_STARTED" : "NOT_STARTED";
  }

  const minSelections = phase.isRequired ? phase.maxSelections : 1;
  const hasEnoughSelections = selections.length >= minSelections;
  const allReceiptsOk = receiptCheck(phase, options, selections);

  if (hasEnoughSelections && allReceiptsOk && fieldsSatisfied) {
    return "COMPLETE";
  }
  return "PARTIALLY_COMPLETE";
}

function receiptCheck(
  phase: { requiresReceiptUpload: boolean },
  options: Array<{ id: string; requiresReceipt: boolean | null }>,
  selections: Array<{ optionId: string; receiptFileId: string | null }>
): boolean {
  const optById = new Map(options.map((o) => [o.id, o] as const));
  for (const s of selections) {
    const opt = optById.get(s.optionId);
    if (!opt) continue; // option deleted; ignore
    const required =
      opt.requiresReceipt === null
        ? phase.requiresReceiptUpload
        : opt.requiresReceipt;
    if (required && s.receiptFileId === null) return false;
  }
  return true;
}

// ─── Stage 3: attendee submit-selections flow ────────────────────────

/**
 * Per-option count snapshot returned to the client on success and on
 * OPTION_FULL conflicts. The client merges these into its local state to
 * recover from a capacity race in one round trip.
 */
export interface OptionCountSummary {
  id: string;
  capacity: number | null;
  taken: number;
  full: boolean; // capacity != null && taken >= capacity
}

export interface SubmitSelectionsResult {
  selections: AttendeeSelection[];
  /** Updated taken/full counts for every option on the phase, post-commit. */
  options: OptionCountSummary[];
  /** New max(updatedAt) across this attendee's selections — concurrency token. */
  selectionsUpdatedAt: string | null;
}

/**
 * Persist an attendee's selection(s) for a phase, with two independent
 * locks held inside one transaction:
 *
 *   1. **AttendeeSelection lock** — `SELECT … FOR UPDATE` on the rows for
 *      (phaseId, registrationId). This protects the change-after-submit
 *      case: if a second tab / device tries to race this submit, its
 *      `expectedSelectionsUpdatedAt` will mismatch the row's current
 *      value and the second submit returns 409.
 *
 *   2. **PhaseOption capacity lock** — `SELECT … FOR UPDATE` on each
 *      target option row, then COUNT existing selections on that option,
 *      then compare to capacity. This protects the capacity race: two
 *      concurrent submits for the same capacity-1 option serialise on
 *      the row lock, the second sees the first's INSERT and throws
 *      OptionFullError.
 *
 * The two concerns are separate. Lock (1) doesn't help with capacity
 * (different rows); lock (2) doesn't help with the user's own
 * concurrency (different table). Both are required.
 *
 * Returns the new selections + a fresh count summary for every option
 * on the phase so the client can recover in a single round-trip.
 */
export interface SubmitSelectionsInput {
  phaseId: string;
  registrationId: string;
  optionIds: string[];
  /**
   * The latest selection updatedAt the client knows about, or null on
   * first-time submit (no prior rows). The server compares to the live
   * MAX(updatedAt) inside the lock; mismatch → 409.
   *
   * `undefined` opts out of the concurrency check entirely (used by the
   * route when the body had no `optionIds` at all and we're only writing
   * field data — service shouldn't be called in that case, but defensive).
   */
  expectedSelectionsUpdatedAt: string | null | undefined;
  /**
   * Used by phase-level guards. The route is responsible for verifying
   * the registration belongs to this event before calling this service.
   */
  eventId: string;
}

/**
 * In-transaction variant. Use this from a route that needs to compose
 * selection writes with another write (e.g. PhaseSubmission upsert) in a
 * single transaction. Throws the same typed errors as the wrapped form.
 */
export async function submitAttendeeSelectionsInTx(
  tx: Prisma.TransactionClient,
  input: SubmitSelectionsInput
): Promise<SubmitSelectionsResult> {
  return _submitInTransaction(tx, input);
}

export async function submitAttendeeSelections(
  input: SubmitSelectionsInput
): Promise<SubmitSelectionsResult> {
  // Capacity-checking transactions serialise on a per-option row lock.
  // Under contention (many attendees racing for a popular option) the
  // queue can exceed Prisma's default 5s interactive transaction
  // timeout, which would surface to the user as a vague "transaction
  // closed" error rather than a clean OPTION_FULL. Widening to 20s
  // covers realistic spikes; each individual attendee's work is well
  // under 100ms, so 20s permits ~hundreds of queued waiters before any
  // legitimate timeout. maxWait gives slow connection pickup some
  // breathing room too.
  return prisma.$transaction(
    (tx) => _submitInTransaction(tx, input),
    { timeout: 20_000, maxWait: 10_000 }
  );
}

async function _submitInTransaction(
  tx: Prisma.TransactionClient,
  input: SubmitSelectionsInput
): Promise<SubmitSelectionsResult> {
  const { phaseId, registrationId, optionIds, expectedSelectionsUpdatedAt } =
    input;

  // De-dup as a safety net; UI shouldn't allow it but a hand-crafted body
  // could send duplicates which would fail on the unique constraint anyway.
  const dedupedOptionIds = Array.from(new Set(optionIds));
  if (dedupedOptionIds.length !== optionIds.length) {
    throw new SelectionDuplicateError();
  }

  // Single-pass body. The outer prisma.$transaction (for the standalone
  // entry point) or the route's $transaction (for the composed path)
  // handles isolation.
  {
    // ── Phase + options snapshot. We pull options here (no lock) so we
    // ── can validate cross-phase ownership and resolve labels for
    // ── error messages without taking unnecessary locks. The capacity
    // ── lock per option is taken explicitly below.
    const phase = await tx.phase.findUnique({
      where: { id: phaseId },
      select: {
        id: true,
        eventId: true,
        type: true,
        selectionMode: true,
        maxSelections: true,
        allowChangeAfterSubmit: true,
        options: {
          select: {
            id: true,
            label: true,
            capacity: true,
            isActive: true,
          },
        },
      },
    });
    if (!phase) throw new PhaseNotFoundForSelectionError();
    if (phase.eventId !== input.eventId) {
      // Cross-event guard. This is also enforced by the route, but the
      // service shouldn't trust the caller to have done it.
      throw new PhaseNotFoundForSelectionError();
    }
    if (phase.type !== "POST_REGISTRATION") {
      throw new SelectionModeNotWritableError(phase.selectionMode);
    }

    // Mode gate: only ATTENDEE_PICKS / MIXED accept attendee writes.
    // ADMIN_ASSIGNED, EXTERNAL_BOOKING, NONE all reject from this path.
    if (
      phase.selectionMode !== "ATTENDEE_PICKS" &&
      phase.selectionMode !== "MIXED"
    ) {
      throw new SelectionModeNotWritableError(phase.selectionMode);
    }

    // maxSelections cap.
    if (dedupedOptionIds.length > phase.maxSelections) {
      throw new TooManySelectionsError(
        phase.maxSelections,
        dedupedOptionIds.length
      );
    }

    // Cross-phase guard: every optionId must exist on this phase and be
    // active. Anything else is a 400 — never silently ignored.
    const optionIndex = new Map(
      phase.options.map((o) => [o.id, o] as const)
    );
    for (const id of dedupedOptionIds) {
      const opt = optionIndex.get(id);
      if (!opt) throw new OptionsCrossPhaseError(id);
      if (!opt.isActive) throw new OptionInactiveError(id, opt.label);
    }

    // ── Lock #1: attendee selection rows for (phaseId, registrationId).
    // FOR UPDATE blocks any concurrent transaction that does the same
    // SELECT until we commit. With READ COMMITTED isolation, concurrent
    // submitters serialise on this lock pair-of-rows.
    const existing = await tx.$queryRaw<
      Array<{ id: string; optionId: string; source: string; updatedAt: Date }>
    >(Prisma.sql`
      SELECT id, "optionId", source::text AS source, "updatedAt"
      FROM "AttendeeSelection"
      WHERE "phaseId" = ${phaseId}
        AND "registrationId" = ${registrationId}
      FOR UPDATE
    `);

    // Concurrency token check. Treat null/null as "initial submit, first
    // write" — that's allowed. Otherwise must match exactly.
    const currentMaxIso =
      existing.length === 0
        ? null
        : new Date(
            Math.max(...existing.map((e) => e.updatedAt.getTime()))
          ).toISOString();

    if (expectedSelectionsUpdatedAt !== undefined) {
      const expected = expectedSelectionsUpdatedAt;
      // Strict equality: any drift is a conflict. The client should have
      // sent the freshest token from its last GET; if the server's is
      // newer (or now-empty when client expected non-empty, or vice
      // versa), reload required.
      if (expected !== currentMaxIso) {
        throw new SelectionsConcurrencyError(currentMaxIso);
      }
    }

    // Permission: admin pre-assignments are not overridable from the
    // attendee path, regardless of allowChangeAfterSubmit. The MIXED
    // spec calls this out explicitly: pre-assigned attendees see read-
    // only.
    if (existing.some((e) => e.source === "ADMIN_ASSIGNED")) {
      throw new SelectionsAdminLockedError();
    }

    // Permission: change-after-submit gate for ATTENDEE_PICKED rows.
    if (
      existing.length > 0 &&
      !phase.allowChangeAfterSubmit
    ) {
      throw new SelectionsLockedError();
    }

    // ── Replace strategy: clear existing rows, then insert new. The
    // existing-rows are already locked from the SELECT FOR UPDATE
    // above, so concurrent reads inside other locks block until we
    // commit. We also update the unique index naturally — no risk of
    // a transient "two rows with the same (phase, reg, option)" state
    // since they're deleted first.
    if (existing.length > 0) {
      await tx.attendeeSelection.deleteMany({
        where: { phaseId, registrationId },
      });
    }

    // ── Lock #2: per-option capacity. For each new optionId we want
    // to insert, lock the option row, count existing selections, then
    // compare to capacity. Two concurrent attendees racing for a
    // capacity-1 option serialise here: the first locks, counts 0,
    // inserts (count becomes 1 within the txn), commits. The second
    // unblocks, counts 1, throws OPTION_FULL.
    //
    // We loop one option at a time (rather than locking all in a
    // single statement) so the FIRST option that's full halts the
    // transaction without inserting any partial rows. This also
    // matches the spec's example pattern.
    for (const optionId of dedupedOptionIds) {
      // Lock the option row.
      await tx.$queryRaw(Prisma.sql`
        SELECT id, capacity FROM "PhaseOption"
        WHERE id = ${optionId}
        FOR UPDATE
      `);

      const opt = optionIndex.get(optionId)!;
      if (opt.capacity == null) continue; // unlimited; no count needed

      const countRows = await tx.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM "AttendeeSelection"
          WHERE "optionId" = ${optionId}
        `
      );
      const taken = countRows[0]?.count != null ? Number(countRows[0].count) : 0;
      if (taken >= opt.capacity) {
        throw new OptionFullError(optionId, opt.label, taken, opt.capacity);
      }
    }

    // All capacity checks passed; insert the new selections.
    const created = await Promise.all(
      dedupedOptionIds.map((optionId) =>
        tx.attendeeSelection.create({
          data: {
            phaseId,
            registrationId,
            optionId,
            source: "ATTENDEE_PICKED",
            assignedBy: null,
          },
        })
      )
    );

    // Build the success-path summary: counts for every option on the
    // phase, post-insert. Client uses this to update its capacity-
    // remaining badges without a follow-up GET.
    const summary = await readOptionCountSummary(tx, phaseId);
    const newMax =
      created.length === 0
        ? null
        : new Date(
            Math.max(...created.map((c) => c.updatedAt.getTime()))
          ).toISOString();

    return {
      selections: created,
      options: summary,
      selectionsUpdatedAt: newMax,
    };
  }
}

/**
 * Read taken/capacity/full for every option on a phase. Used by the
 * 409 OPTION_FULL recovery path in the route handler — outside the
 * failed transaction — so the client gets a fresh post-rollback view
 * in a single response.
 *
 * Accepts a transaction client OR the global prisma client.
 */
export async function readOptionCountSummary(
  client: Prisma.TransactionClient | typeof prisma,
  phaseId: string
): Promise<OptionCountSummary[]> {
  const rows = await client.phaseOption.findMany({
    where: { phaseId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      capacity: true,
      _count: { select: { selections: true } },
    },
  });
  return rows.map((r) => {
    const taken = r._count.selections;
    return {
      id: r.id,
      capacity: r.capacity,
      taken,
      full: r.capacity != null && taken >= r.capacity,
    };
  });
}

// ─── Stage 3 typed errors (route maps to HTTP status + code) ─────────

export class PhaseNotFoundForSelectionError extends Error {
  readonly code = "PHASE_NOT_FOUND";
  constructor() {
    super("Phase not found.");
  }
}

export class SelectionModeNotWritableError extends Error {
  readonly code = "SELECTION_MODE_NOT_WRITABLE";
  constructor(public readonly mode: string) {
    super(
      `This phase's selection mode (${mode}) does not accept selections from the attendee.`
    );
  }
}

export class TooManySelectionsError extends Error {
  readonly code = "TOO_MANY_SELECTIONS";
  constructor(
    public readonly maxSelections: number,
    public readonly attempted: number
  ) {
    super(
      `You can pick at most ${maxSelections} option${
        maxSelections === 1 ? "" : "s"
      } for this phase. You picked ${attempted}.`
    );
  }
}

export class OptionsCrossPhaseError extends Error {
  readonly code = "OPTION_NOT_ON_PHASE";
  constructor(public readonly optionId: string) {
    super("One of the chosen options doesn't belong to this phase.");
  }
}

export class OptionInactiveError extends Error {
  readonly code = "OPTION_INACTIVE";
  constructor(public readonly optionId: string, public readonly label: string) {
    super(`"${label}" is no longer available for new picks.`);
  }
}

export class SelectionDuplicateError extends Error {
  readonly code = "SELECTION_DUPLICATE";
  constructor() {
    super("Each option can be picked at most once.");
  }
}

export class SelectionsAdminLockedError extends Error {
  readonly code = "SELECTIONS_ADMIN_LOCKED";
  constructor() {
    super(
      "Your selection on this phase was set by your organizer and cannot be changed here. Contact them if you need to change it."
    );
  }
}

export class SelectionsLockedError extends Error {
  readonly code = "SELECTIONS_LOCKED";
  constructor() {
    super(
      "This phase doesn't allow changes once submitted. Contact your organizer if you need to change your selection."
    );
  }
}

export class SelectionsConcurrencyError extends Error {
  readonly code = "SELECTIONS_CONCURRENCY";
  constructor(public readonly currentSelectionsUpdatedAt: string | null) {
    super(
      "Your selection was updated elsewhere since you loaded this page. Reload to see the latest, then re-apply your edit."
    );
  }
}

export class OptionFullError extends Error {
  readonly code = "OPTION_FULL";
  constructor(
    public readonly optionId: string,
    public readonly label: string,
    public readonly taken: number,
    public readonly capacity: number
  ) {
    super(
      `"${label}" just filled up while you were choosing. Please pick another option.`
    );
  }
}

// ─── Stage 5: admin assignment + listings ────────────────────────────

/**
 * Per-attendee admin view of every option-bearing phase on the event.
 * Returns enough for the Selections card on the attendee detail page:
 * phase shape + this attendee's current selections (with option label,
 * source, admin audit fields, notes, receipt summary) + the full
 * option list with live taken/capacity counts so the assign dropdown
 * can render them inline.
 *
 * Notes are returned here because this is the admin perimeter — the
 * portal endpoints already strip them.
 */
export async function listAttendeeSelectionsForAdmin(
  eventId: string,
  registrationId: string,
  attendeeCategory: string | null
) {
  const phases = await prisma.phase.findMany({
    where: {
      eventId,
      type: "POST_REGISTRATION",
      isActive: true,
      selectionMode: { not: "NONE" },
    },
    orderBy: { order: "asc" },
    include: {
      accessOverrides: {
        where: { registrationId },
        select: { status: true },
      },
      options: {
        orderBy: { order: "asc" },
        include: { _count: { select: { selections: true } } },
      },
      selections: {
        where: { registrationId },
        include: {
          option: { select: { id: true, label: true, labelAr: true } },
          receipt: {
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
              uploadedAt: true,
            },
          },
        },
      },
    },
  });

  // Resolve assignedBy user IDs → emails for display. Batch one query
  // covering every distinct user across all phases so the request stays
  // O(1) in DB round-trips regardless of phase count.
  const assignedByIds = Array.from(
    new Set(
      phases
        .flatMap((p) => p.selections)
        .map((s) => s.assignedBy)
        .filter((id): id is string => !!id)
    )
  );
  const users =
    assignedByIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: assignedByIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
  const userById = new Map(users.map((u) => [u.id, u] as const));

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
    .map((p) => ({
    id: p.id,
    title: p.title,
    titleAr: p.titleAr,
    description: p.description,
    descriptionAr: p.descriptionAr,
    selectionMode: p.selectionMode,
    maxSelections: p.maxSelections,
    isRequired: p.isRequired,
    allowChangeAfterSubmit: p.allowChangeAfterSubmit,
    requiresReceiptUpload: p.requiresReceiptUpload,
    options: p.options.map((o) => ({
      id: o.id,
      label: o.label,
      labelAr: o.labelAr,
      capacity: o.capacity,
      taken: o._count.selections,
      full:
        o.capacity != null && o._count.selections >= o.capacity,
      isActive: o.isActive,
      requiresReceipt: o.requiresReceipt,
    })),
    selections: p.selections.map((s) => ({
      id: s.id,
      optionId: s.optionId,
      optionLabel: s.option.label,
      optionLabelAr: s.option.labelAr,
      source: s.source,
      assignedAt: s.assignedAt,
      assignedBy: s.assignedBy,
      assignedByUser: s.assignedBy
        ? userById.get(s.assignedBy)
          ? {
              id: s.assignedBy,
              name: userById.get(s.assignedBy)?.name ?? null,
              email: userById.get(s.assignedBy)?.email ?? null,
            }
          : null
        : null,
      notes: s.notes,
      hasReceipt: !!s.receiptFileId,
      receipt: s.receipt
        ? {
            id: s.receipt.id,
            originalName: s.receipt.originalName,
            mimeType: s.receipt.mimeType,
            sizeBytes: s.receipt.sizeBytes,
            uploadedAt: s.receipt.uploadedAt,
          }
        : null,
    })),
  }));
}

export interface AdminWriteSelectionsInput {
  eventId: string;
  phaseId: string;
  registrationId: string;
  optionIds: string[];
  notes: string | null;
  /** User.id of the admin making the change — written to assignedBy. */
  adminUserId: string;
  /**
   * When true, skip capacity locks entirely. The admin's write goes
   * through even if the option is already full. Per the spec: "Admin
   * force-assignment **bypasses the capacity check** but writes a
   * warning into the response."
   *
   * We do NOT acquire SELECT … FOR UPDATE on the option in the force
   * path — holding the lock for a write that's intentionally
   * bypassing capacity would needlessly contend with concurrent
   * attendee picks. Only the AttendeeSelection lock for the user's
   * own (phase, reg) pair is taken.
   */
  force: boolean;
}

export interface AdminWriteSelectionsResult {
  selections: AttendeeSelection[];
  options: OptionCountSummary[];
  overCapacity: Array<{ optionId: string; taken: number; capacity: number }>;
}

export class AdminWriteCapacityError extends Error {
  readonly code = "OPTION_FULL_ADMIN";
  constructor(
    public readonly optionId: string,
    public readonly label: string,
    public readonly taken: number,
    public readonly capacity: number
  ) {
    super(
      `"${label}" is at ${taken}/${capacity}. Resubmit with force=true to assign past capacity.`
    );
  }
}

/**
 * Admin pre-assignment / re-assignment for a single phase. Replaces
 * any existing selections (admin- or attendee-picked) for this
 * attendee on this phase. Writes `source = ADMIN_ASSIGNED` and
 * `assignedBy = adminUserId` for audit. Capacity is enforced unless
 * `force` is true.
 *
 * Two transaction locks (same shape as Stage 3 but the option lock is
 * conditional):
 *   1. AttendeeSelection rows for (phaseId, registrationId) — always.
 *      Protects against concurrent admin / attendee edits to this
 *      attendee's own state.
 *   2. PhaseOption rows for each target optionId — only when !force.
 *      The force path writes without contending with capacity locks
 *      held by concurrent attendee picks.
 *
 * When replacing a selection that has a linked receipt, the old
 * receipt's blob is deleted best-effort and its row removed (cascade
 * doesn't fire on the AttendeeSelection delete — the FK is
 * SetNull-on-PhaseReceipt-delete, not the other direction). Stage 5's
 * orphan cleanup is the safety net.
 */
export async function adminWriteSelections(
  input: AdminWriteSelectionsInput
): Promise<AdminWriteSelectionsResult> {
  const dedupedOptionIds = Array.from(new Set(input.optionIds));
  if (dedupedOptionIds.length !== input.optionIds.length) {
    throw new SelectionDuplicateError();
  }

  return prisma.$transaction(async (tx) => {
    const phase = await tx.phase.findUnique({
      where: { id: input.phaseId },
      select: {
        id: true,
        eventId: true,
        type: true,
        selectionMode: true,
        maxSelections: true,
        options: {
          select: { id: true, label: true, capacity: true, isActive: true },
        },
      },
    });
    if (!phase) throw new PhaseNotFoundForSelectionError();
    if (phase.eventId !== input.eventId) {
      throw new PhaseNotFoundForSelectionError();
    }
    if (phase.type !== "POST_REGISTRATION") {
      throw new SelectionModeNotWritableError(phase.selectionMode);
    }
    if (phase.selectionMode === "NONE") {
      throw new SelectionModeNotWritableError(phase.selectionMode);
    }
    if (dedupedOptionIds.length > phase.maxSelections) {
      throw new TooManySelectionsError(
        phase.maxSelections,
        dedupedOptionIds.length
      );
    }
    const optionIndex = new Map(
      phase.options.map((o) => [o.id, o] as const)
    );
    for (const id of dedupedOptionIds) {
      const opt = optionIndex.get(id);
      if (!opt) throw new OptionsCrossPhaseError(id);
      // Admin can assign to inactive options too (force-recover an
      // attendee mid-flight), but only when they're force-writing. The
      // normal admin path still respects isActive — matches the
      // attendee path's behaviour.
      if (!opt.isActive && !input.force) {
        throw new OptionInactiveError(id, opt.label);
      }
    }

    // ── AttendeeSelection lock for this attendee's (phase, reg)
    // rows. Held in both force and non-force paths.
    const existing = await tx.$queryRaw<
      Array<{ id: string; receiptFileId: string | null }>
    >(Prisma.sql`
      SELECT id, "receiptFileId"
      FROM "AttendeeSelection"
      WHERE "phaseId" = ${input.phaseId}
        AND "registrationId" = ${input.registrationId}
      FOR UPDATE
    `);

    // Capacity check + option-row lock — only on the non-force path.
    // The force path intentionally skips lock acquisition so it
    // doesn't contend with concurrent attendee picks on the same
    // option row.
    const overCapacity: Array<{
      optionId: string;
      taken: number;
      capacity: number;
    }> = [];
    if (!input.force) {
      for (const optionId of dedupedOptionIds) {
        await tx.$queryRaw(Prisma.sql`
          SELECT id, capacity FROM "PhaseOption"
          WHERE id = ${optionId}
          FOR UPDATE
        `);
        const opt = optionIndex.get(optionId)!;
        if (opt.capacity == null) continue;
        const countRows = await tx.$queryRaw<Array<{ count: bigint }>>(
          Prisma.sql`
            SELECT COUNT(*)::bigint AS count
            FROM "AttendeeSelection"
            WHERE "optionId" = ${optionId}
              AND "registrationId" <> ${input.registrationId}
          `
        );
        const takenExcludingThisAttendee =
          countRows[0]?.count != null ? Number(countRows[0].count) : 0;
        if (takenExcludingThisAttendee >= opt.capacity) {
          throw new AdminWriteCapacityError(
            optionId,
            opt.label,
            takenExcludingThisAttendee,
            opt.capacity
          );
        }
      }
    } else {
      // Force path — record which target options are currently at-
      // or-over capacity for the response payload. Read-only check
      // (no lock) so it's purely informational and doesn't block.
      for (const optionId of dedupedOptionIds) {
        const opt = optionIndex.get(optionId)!;
        if (opt.capacity == null) continue;
        const countRows = await tx.$queryRaw<Array<{ count: bigint }>>(
          Prisma.sql`
            SELECT COUNT(*)::bigint AS count
            FROM "AttendeeSelection"
            WHERE "optionId" = ${optionId}
              AND "registrationId" <> ${input.registrationId}
          `
        );
        const taken =
          countRows[0]?.count != null ? Number(countRows[0].count) : 0;
        if (taken >= opt.capacity) {
          overCapacity.push({
            optionId,
            taken: taken + 1,
            capacity: opt.capacity,
          });
        }
      }
    }

    // Collect existing-selection receipt IDs so we can delete the
    // orphaned blobs after the DB replace. Done AFTER lock acquisition
    // so concurrent admin writes serialise on the AttendeeSelection
    // rows.
    const orphanedReceiptIds = existing
      .map((e) => e.receiptFileId)
      .filter((id): id is string => !!id);

    if (existing.length > 0) {
      await tx.attendeeSelection.deleteMany({
        where: {
          phaseId: input.phaseId,
          registrationId: input.registrationId,
        },
      });
    }

    // Insert new selections with admin audit fields.
    const created = await Promise.all(
      dedupedOptionIds.map((optionId) =>
        tx.attendeeSelection.create({
          data: {
            phaseId: input.phaseId,
            registrationId: input.registrationId,
            optionId,
            source: "ADMIN_ASSIGNED",
            assignedBy: input.adminUserId,
            notes: input.notes ?? null,
          },
        })
      )
    );

    // Delete orphaned receipt rows from the DB inside the same txn.
    // Blob deletes are best-effort and happen AFTER commit (outside
    // this txn) since they can't roll back. We pass the IDs back to
    // the caller through a side channel.
    if (orphanedReceiptIds.length > 0) {
      await tx.phaseReceipt.deleteMany({
        where: { id: { in: orphanedReceiptIds } },
      });
    }

    const summary = await readOptionCountSummary(tx, input.phaseId);

    // Blob-path collection happens in the wrapper
    // (adminWriteSelectionsWithCleanup) BEFORE this txn runs, so the
    // post-commit blob deletes have what they need. Keeping the txn
    // tight here means lock hold time stays minimal.

    return {
      selections: created,
      options: summary,
      overCapacity,
    };
  });
}

/**
 * Wraps adminWriteSelections to also do best-effort blob cleanup for
 * orphaned receipts AFTER the DB transaction commits. Splitting the
 * post-commit work out of the transaction keeps the lock-hold time
 * minimal and means a blob delete failure can't roll back the DB
 * change.
 */
export async function adminWriteSelectionsWithCleanup(
  input: AdminWriteSelectionsInput
): Promise<AdminWriteSelectionsResult & { blobsDeleted: number }> {
  // Capture the pre-write receipt blob paths BEFORE the txn so we
  // know what to delete from Blob after it commits. The txn itself
  // deletes the PhaseReceipt rows; blob deletes are post-commit.
  const existingReceipts = await prisma.phaseReceipt.findMany({
    where: {
      selection: {
        phaseId: input.phaseId,
        registrationId: input.registrationId,
      },
    },
    select: { blobPath: true },
  });

  const result = await adminWriteSelections(input);

  let blobsDeleted = 0;
  for (const r of existingReceipts) {
    try {
      // Imported inline below to avoid pulling @vercel/blob into the
      // module's top-level imports for code paths that never use it.
      const { deleteBlob } = await import("@/lib/blob");
      await deleteBlob(r.blobPath);
      blobsDeleted += 1;
    } catch (err) {
      console.warn(
        "[adminWriteSelectionsWithCleanup] blob delete failed:",
        r.blobPath,
        err
      );
    }
  }

  return { ...result, blobsDeleted };
}

/**
 * Clear (delete) a single AttendeeSelection row as an admin. Caller
 * is responsible for ensuring the selection belongs to a phase on the
 * target event. Returns the linked receipt path (if any) so the route
 * can do the post-commit blob delete.
 */
export async function clearSelectionForAdmin(
  selectionId: string,
  eventId: string
): Promise<{ deletedBlobPath: string | null }> {
  return prisma.$transaction(async (tx) => {
    const sel = await tx.attendeeSelection.findUnique({
      where: { id: selectionId },
      include: {
        phase: { select: { eventId: true } },
        receipt: { select: { id: true, blobPath: true } },
      },
    });
    if (!sel) throw new Error("Selection not found");
    if (sel.phase.eventId !== eventId) {
      throw new Error("Selection doesn't belong to this event");
    }
    let deletedBlobPath: string | null = null;
    if (sel.receipt) {
      deletedBlobPath = sel.receipt.blobPath;
      // Cascade-style cleanup: delete the receipt row inside this txn.
      // The blob delete happens post-commit (best-effort).
      await tx.phaseReceipt.delete({ where: { id: sel.receipt.id } });
    }
    await tx.attendeeSelection.delete({ where: { id: sel.id } });
    return { deletedBlobPath };
  });
}

/**
 * Stats helper — full-attendee per-option breakdown for the
 * statistics page. Returns one row per option with taken count,
 * receipt counts, and the phase aggregates. Doesn't include
 * attendee identities; that's a separate lazy fetch via the
 * stream-friendly listPhaseSelectionsForAdmin.
 */
export async function listPhaseOptionStats(eventId: string) {
  const phases = await prisma.phase.findMany({
    where: {
      eventId,
      type: "POST_REGISTRATION",
      isActive: true,
      selectionMode: { not: "NONE" },
    },
    orderBy: { order: "asc" },
    include: {
      options: {
        orderBy: { order: "asc" },
        include: {
          _count: { select: { selections: true } },
          selections: {
            select: { receiptFileId: true },
          },
        },
      },
    },
  });

  return phases.map((p) => ({
    id: p.id,
    title: p.title,
    selectionMode: p.selectionMode,
    requiresReceiptUpload: p.requiresReceiptUpload,
    options: p.options.map((o) => {
      const taken = o._count.selections;
      const receiptCount = o.selections.filter(
        (s) => s.receiptFileId !== null
      ).length;
      const receiptRequired =
        o.requiresReceipt === null
          ? p.requiresReceiptUpload
          : o.requiresReceipt;
      return {
        id: o.id,
        label: o.label,
        capacity: o.capacity,
        taken,
        full: o.capacity != null && taken >= o.capacity,
        receiptRequired,
        receiptCount,
      };
    }),
  }));
}

/**
 * Async generator that streams selections for a phase in cursor-paged
 * batches. Used by both the JSON attendee-list expand AND the CSV
 * export so the response body streams as rows are queried rather
 * than buffering ~5000+ rows in memory for a large phase.
 *
 * Yields one selection at a time (with joined contact/option/receipt
 * data). Callers compose the output: JSON array for the expand, CSV
 * row encoding for the export.
 */
/**
 * Async generator that streams selections for a phase in cursor-paged
 * batches. Used by both the JSON attendee-list expand AND the CSV
 * export so the response body streams as rows are queried rather
 * than buffering ~5000+ rows in memory for a large phase.
 */
export type AdminPhaseSelection = Prisma.AttendeeSelectionGetPayload<{
  include: {
    option: { select: { id: true; label: true } };
    registration: {
      select: {
        id: true;
        contact: {
          select: {
            firstName: true;
            lastName: true;
            email: true;
            phone: true;
          };
        };
      };
    };
    receipt: { select: { id: true; originalName: true; uploadedAt: true } };
  };
}>;

export async function* streamPhaseSelectionsForAdmin(
  phaseId: string,
  eventId: string,
  filterOptionId?: string
): AsyncGenerator<AdminPhaseSelection, void, void> {
  const BATCH_SIZE = 500;
  let cursor: string | undefined = undefined;
  while (true) {
    const args: Prisma.AttendeeSelectionFindManyArgs = {
      where: {
        phaseId,
        phase: { eventId },
        ...(filterOptionId && { optionId: filterOptionId }),
      },
      take: BATCH_SIZE,
      orderBy: { id: "asc" },
      include: {
        option: { select: { id: true, label: true } },
        registration: {
          select: {
            id: true,
            contact: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        receipt: {
          select: { id: true, originalName: true, uploadedAt: true },
        },
      },
    };
    if (cursor) {
      args.skip = 1;
      args.cursor = { id: cursor };
    }
    const batch = (await prisma.attendeeSelection.findMany(
      args
    )) as AdminPhaseSelection[];
    if (batch.length === 0) return;
    for (const row of batch) yield row;
    if (batch.length < BATCH_SIZE) return;
    cursor = batch[batch.length - 1].id;
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
