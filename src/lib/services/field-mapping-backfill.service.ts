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

// ─── Preview ──────────────────────────────────────────────────────

/**
 * Compute the full backfill preview for an event. Reads:
 *   - REGISTRATION-phase FormFields for the event (only those carry
 *     mapsTo tags the resolver acts on; POST_REGISTRATION phase fields
 *     are not part of the Contact-column source)
 *   - Every Registration for the event with its Contact relation
 *
 * No writes. Result feeds both the preview dialog (Stage 3c UI) and
 * the run endpoint's expectedWillUpdate guard (Stage 3b).
 */
export async function computeBackfillPreview(
  eventId: string,
  overwriteNonEmpty: boolean
): Promise<BackfillPreview> {
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
      // Locked sort: oldest first. The run endpoint (Chunk 3b) re-runs
      // this preview to validate expectedWillUpdate; without a stable
      // order, a row added between preview and run could shift counts
      // and falsely trip the stale-preview 409. Oldest-first also means
      // the 500-cap truncation keeps the longest-standing rows that
      // most need backfilling — newest entries are likely already
      // covered by the live Stage 2 resolver.
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
  let diffsTruncated = false;

  for (const reg of registrations) {
    const decision = resolveContactColumnsForRegistration(
      reg,
      fields,
      overwriteNonEmpty
    );
    if (decision.kind === "update") {
      willUpdate++;
      if (diffs.length < PREVIEW_DIFF_CAP) {
        diffs.push(decision.diff);
      } else {
        diffsTruncated = true;
      }
    } else if (decision.kind === "alreadyCorrect") {
      alreadyCorrect++;
    } else {
      skipped++;
    }
  }

  return { willUpdate, alreadyCorrect, skipped, diffs, diffsTruncated };
}

// ─── Internal helpers ─────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Re-export for parity with the run endpoint (Stage 3b consumer). */
export type { ResolvedContactColumns };
