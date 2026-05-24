import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSyntheticEmail } from "@/lib/contact/synthetic-email";
import {
  resolveContactColumns,
  type ResolverField,
  type ResolvedContactColumns,
} from "@/lib/services/field-mapping.service";

/**
 * Maximum number of per-row diffs returned in a preview response. The
 * summary counts (willUpdate / alreadyCorrect / skipped) are uncapped
 * and reflect the full sweep; only the inline diff table is truncated.
 * UI shows "and N more (apply to see)" when this cap is hit.
 */
export const PREVIEW_DIFF_CAP = 500;

/**
 * Columns the resolver produces. Tied 1:1 to the `Contact` writable
 * columns the backfill touches; backfill does NOT modify category,
 * metadata, status, or any audit-trail field.
 */
type WritableColumn =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "organization"
  | "designation";

type ChangeMap = Partial<Record<WritableColumn, string>>;

export interface BackfillDiff {
  registrationId: string;
  contactId: string;
  /** "{firstName} {lastName}" or "(no name)" — for UI display + error attribution */
  contactName: string;
  /** Existing Contact.email — for UI display + error attribution */
  contactEmail: string;
  /**
   * Per-column changes. Only columns that will actually be written
   * appear here. A single update may touch firstName + skip email +
   * skip organization, all from the same row — the toggle gate is
   * applied COLUMN-BY-COLUMN, not row-by-row (per Stage 3 spec
   * clarification).
   */
  changes: ChangeMap;
  /**
   * Existing values for each column being changed. Powers the
   * "from → to" rendering in the preview detail table.
   */
  previous: ChangeMap;
}

export type BackfillRowDecision =
  | { kind: "update"; diff: BackfillDiff }
  | { kind: "alreadyCorrect" }
  | { kind: "skipped" };

export interface BackfillPreview {
  willUpdate: number;
  alreadyCorrect: number;
  skipped: number;
  /** Capped at PREVIEW_DIFF_CAP. `diffsTruncated` indicates whether more existed. */
  diffs: BackfillDiff[];
  diffsTruncated: boolean;
}

/**
 * Snapshot of a Registration row + its Contact at the moment we read
 * it. Backfill operates on this snapshot — the run endpoint re-reads
 * and re-validates via expectedWillUpdate before writing (Stage 3b).
 */
export interface RegistrationForBackfill {
  id: string;
  contactId: string;
  formData: Prisma.JsonValue | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    organization: string | null;
    designation: string | null;
  };
}

// ─── Per-row decision ──────────────────────────────────────────────

/**
 * Compute a backfill decision for a single registration row. Pure
 * function: no DB access. The route handler loads registrations +
 * fields, fans out across this helper, aggregates the buckets, and
 * returns a {@link BackfillPreview}.
 *
 * Per-column write decision (spec clarification 1):
 *   - Overwrite OFF (default): write a column only if existing is
 *     empty/null AND resolved is non-null.
 *   - Overwrite ON: write a column whenever resolved differs from
 *     existing.
 *   - Email always: synthetic existing email + real resolved email →
 *     replace regardless of toggle (synthetics are placeholders, not
 *     real data). Empty resolved email → skip column regardless of
 *     toggle (no retroactive synthesis — that's reserved for live
 *     submissions without an email).
 *
 * Bucket assignment for the row:
 *   - "update"         — changes is non-empty.
 *   - "alreadyCorrect" — changes is empty AND at least one column had
 *                        a non-null resolved value that matched
 *                        existing.
 *   - "skipped"        — neither of the above (resolver produced
 *                        nothing useful, OR everything that resolved
 *                        was blocked by overwrite-off).
 */
export function resolveContactColumnsForRegistration(
  registration: RegistrationForBackfill,
  fields: readonly ResolverField[],
  overwriteNonEmpty: boolean
): BackfillRowDecision {
  // Registration.formData is Json? in the schema. Coerce non-object /
  // null values to {} so the resolver always gets a valid Record.
  const formData = isPlainObject(registration.formData)
    ? (registration.formData as Record<string, unknown>)
    : {};

  // Resolver's final-rung fallback reads body.fullName; for backfill
  // the equivalent is formData.fullName (the stored submission blob).
  const legacyBodyFullName = formData.fullName;

  const resolved = resolveContactColumns(fields, formData, legacyBodyFullName);

  const existingEmailIsSynthetic = isSyntheticEmail(registration.contact.email);

  const changes: ChangeMap = {};
  const previous: ChangeMap = {};
  let matchedAnyResolved = false;

  // Non-email columns: identical decision logic. Email gets its own
  // block below because of the synthetic-override + empty-skip rules.
  const nonEmailColumns: ReadonlyArray<Exclude<WritableColumn, "email">> = [
    "firstName",
    "lastName",
    "phone",
    "organization",
    "designation",
  ];

  for (const col of nonEmailColumns) {
    const resolvedVal = resolved[col];
    if (resolvedVal === null) continue; // resolver had no value for this column
    const existing = registration.contact[col];
    const existingIsEmpty = existing === null || existing === "";

    if (resolvedVal === existing) {
      matchedAnyResolved = true;
      continue;
    }

    if (overwriteNonEmpty || existingIsEmpty) {
      changes[col] = resolvedVal;
      previous[col] = existing ?? "";
    }
    // Else (overwrite OFF + existing non-empty): blocked — contributes
    // to "skipped" bucket if nothing else fires.
  }

  // Email column — special rules.
  const resolvedEmailRaw = resolved.email;
  if (resolvedEmailRaw !== null) {
    const resolvedEmail = resolvedEmailRaw.toLowerCase();
    const existingEmail = registration.contact.email;

    if (resolvedEmail === existingEmail) {
      matchedAnyResolved = true;
    } else if (existingEmailIsSynthetic) {
      // Synthetic → real: always replace, bypassing the toggle. The
      // synthetic was a placeholder; the resolver-found email is the
      // real one we should have had from the start.
      changes.email = resolvedEmail;
      previous.email = existingEmail;
    } else if (overwriteNonEmpty) {
      changes.email = resolvedEmail;
      previous.email = existingEmail;
    }
    // Else (overwrite OFF + existing real, non-synthetic, non-empty):
    // blocked. Stays in skipped bucket if no other column fires.
  }
  // If resolvedEmailRaw === null, always skip email entirely. No
  // retroactive synthetic-email generation.

  if (Object.keys(changes).length > 0) {
    const contactName = `${registration.contact.firstName} ${registration.contact.lastName}`.trim();
    return {
      kind: "update",
      diff: {
        registrationId: registration.id,
        contactId: registration.contactId,
        contactName: contactName || "(no name)",
        contactEmail: registration.contact.email,
        changes,
        previous,
      },
    };
  }

  return { kind: matchedAnyResolved ? "alreadyCorrect" : "skipped" };
}

// ─── Preview + load helpers ───────────────────────────────────────

export interface BackfillDecisions {
  willUpdate: number;
  alreadyCorrect: number;
  skipped: number;
  /** Uncapped — every row classified as update appears here. */
  diffs: BackfillDiff[];
}

/**
 * Internal: load every Registration on the event + its Contact +
 * the REGISTRATION-phase FormFields, then fan across the per-row
 * decision helper and aggregate the buckets. Uncapped. Both
 * computeBackfillPreview (capped wrapper for UI) and the run
 * endpoint's expectedWillUpdate guard go through this — one
 * source of truth for the decision sweep.
 *
 * NOT exported. Callers should use `computeBackfillPreview` (capped)
 * or `loadBackfillDecisions` (uncapped) depending on intent.
 */
async function gatherBackfillDecisions(
  eventId: string,
  overwriteNonEmpty: boolean
): Promise<BackfillDecisions> {
  const [fields, registrations] = await Promise.all([
    prisma.formField.findMany({
      where: {
        eventId,
        // FormField → Step → Phase relation; filter by the REGISTRATION
        // phase. POST_REGISTRATION fields don't carry Contact-column
        // mappings (their data lives in PhaseSubmission, not the
        // Contact row), so backfill must not consider them.
        step: { phase: { type: "REGISTRATION" } },
        // mapsTo filter is intentionally absent — the resolver's legacy
        // literal-key fallback rung needs every field's `name`, not just
        // tagged ones, to know what's currently in formData. Same
        // shape the live register endpoint passes.
      },
      select: { name: true, mapsTo: true, order: true },
    }),
    prisma.registration.findMany({
      where: { eventId },
      // Locked sort: oldest first. The run endpoint's expectedWillUpdate
      // guard re-runs this loader to compare counts; without a stable
      // order, a row added between preview and run could shift counts
      // and falsely trip the stale-preview 409. Oldest-first also means
      // the 500-cap truncation in computeBackfillPreview keeps the
      // longest-standing rows that most need backfilling — newest
      // entries are likely already covered by the live Stage 2 resolver.
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        contactId: true,
        formData: true,
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            organization: true,
            designation: true,
          },
        },
      },
    }),
  ]);

  let willUpdate = 0;
  let alreadyCorrect = 0;
  let skipped = 0;
  const diffs: BackfillDiff[] = [];

  for (const reg of registrations) {
    const decision = resolveContactColumnsForRegistration(
      reg,
      fields,
      overwriteNonEmpty
    );
    if (decision.kind === "update") {
      willUpdate++;
      diffs.push(decision.diff);
    } else if (decision.kind === "alreadyCorrect") {
      alreadyCorrect++;
    } else {
      skipped++;
    }
  }

  return { willUpdate, alreadyCorrect, skipped, diffs };
}

/**
 * Capped preview wrapper for the preview endpoint. Trims diffs to
 * {@link PREVIEW_DIFF_CAP} and reports `diffsTruncated`.
 */
export async function computeBackfillPreview(
  eventId: string,
  overwriteNonEmpty: boolean
): Promise<BackfillPreview> {
  const all = await gatherBackfillDecisions(eventId, overwriteNonEmpty);
  return {
    willUpdate: all.willUpdate,
    alreadyCorrect: all.alreadyCorrect,
    skipped: all.skipped,
    diffs: all.diffs.slice(0, PREVIEW_DIFF_CAP),
    diffsTruncated: all.diffs.length > PREVIEW_DIFF_CAP,
  };
}

/**
 * Uncapped load for the run endpoint. Returns every diff, plus the
 * same {willUpdate, alreadyCorrect, skipped} counts used by the
 * preview. The route compares willUpdate against the client's
 * expectedWillUpdate before applying.
 */
export async function loadBackfillDecisions(
  eventId: string,
  overwriteNonEmpty: boolean
): Promise<BackfillDecisions> {
  return gatherBackfillDecisions(eventId, overwriteNonEmpty);
}

// ─── Run (batch writer) ───────────────────────────────────────────

export interface BackfillFailure {
  contactId: string;
  contactName: string;
  contactEmail: string;
  error: string;
}

export interface BackfillRunResult {
  updated: number;
  failed: BackfillFailure[];
  /**
   * 1-indexed row number where processing stopped, if the outer
   * try/catch fired. Absent on a clean completion (including the
   * case where some rows are in `failed` but the loop ran to
   * completion — those are row-attributable failures, not
   * interruptions).
   */
  interruptedAtRow?: number;
}

/**
 * Batch size for the fast-path Prisma transaction. 100 balances:
 *   - per-tx round-trip overhead (lower is wasteful)
 *   - transaction duration cap on most Postgres configs (higher
 *     risks idle_in_transaction timeouts)
 *   - granularity of the rollback radius on fast-path failure (a
 *     batch failure forces the slow-path to retry up to 100 rows)
 */
export const BACKFILL_BATCH_SIZE = 100;

/**
 * Apply the resolved diffs to Contact rows in batches.
 *
 * Hybrid fast-path / slow-path:
 *   - Fast path: 100 updates wrapped in a single `prisma.$transaction`.
 *     If every row succeeds, commit and move to the next batch.
 *   - Slow path (on batch failure): replay each row of the failed
 *     batch as a standalone update with its own try/catch. Per-row
 *     failures land in `failed[]` with contactName + contactEmail
 *     attribution (Clarification 2). Rows that succeed on the retry
 *     are counted in `updated`.
 *
 * Outer try/catch (Clarification 3): if anything escapes the batch
 * loop entirely (slow-path orchestration breaks, Prisma client
 * itself dies), the result still returns `{updated, failed}` for
 * everything processed so far plus `interruptedAtRow` so the result
 * modal can show "interrupted at row N of M" instead of swallowing
 * partial progress.
 *
 * The caller (route handler) is responsible for:
 *   - Re-running the preview and confirming willUpdate matches the
 *     client's expectedWillUpdate BEFORE invoking this function
 *     (stale-guard).
 *   - Passing the diffs from that same re-run so the writer operates
 *     on the snapshot the guard validated.
 */
export async function executeBackfillBatches(
  diffs: readonly BackfillDiff[]
): Promise<BackfillRunResult> {
  let updated = 0;
  const failed: BackfillFailure[] = [];

  try {
    for (let i = 0; i < diffs.length; i += BACKFILL_BATCH_SIZE) {
      const batch = diffs.slice(i, i + BACKFILL_BATCH_SIZE);
      try {
        // Fast path: atomic batch. Prisma runs the array sequentially;
        // a single row's failure rolls the whole batch back.
        await prisma.$transaction(
          batch.map((d) =>
            prisma.contact.update({
              where: { id: d.contactId },
              data: d.changes,
            })
          )
        );
        updated += batch.length;
      } catch {
        // Slow path: retry each row standalone for granular error
        // attribution. The original batchErr is discarded — the
        // per-row errors below carry the actual cause.
        for (const d of batch) {
          try {
            await prisma.contact.update({
              where: { id: d.contactId },
              data: d.changes,
            });
            updated++;
          } catch (rowErr) {
            failed.push({
              contactId: d.contactId,
              contactName: d.contactName,
              contactEmail: d.contactEmail,
              error: rowErr instanceof Error ? rowErr.message : String(rowErr),
            });
          }
        }
      }
    }
    return { updated, failed };
  } catch (loopErr) {
    // Outer catch: defensive. The slow path already absorbs per-row
    // errors, so this fires only on something the batch orchestration
    // itself can't handle (Prisma client crash, OOM, etc.).
    console.error("[field-mapping-backfill] loop interrupted:", loopErr);
    return {
      updated,
      failed,
      // 1-indexed row count where the orchestrator died. The
      // preceding rows split between `updated` (succeeded) and
      // `failed` (per-row attribution); together they're the rows
      // that completed processing one way or the other. The
      // interrupted row itself didn't finish — the slow-path
      // catch couldn't absorb the cause. Human display:
      // "interrupted at row N of M".
      interruptedAtRow: updated + failed.length,
    };
  }
}

// ─── Internal helpers ─────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Re-export for parity with the run endpoint (Stage 3b consumer). */
export type { ResolvedContactColumns };
