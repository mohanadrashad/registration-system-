import { FieldMapping } from "@prisma/client";

/**
 * Minimal field shape the resolver needs — just the three columns it
 * reads. Callers pass `event.phases[0].steps.flatMap(s => s.fields)`
 * (live registration) or `event.formFields` from a flat select query
 * (backfill); both already carry `name`, `mapsTo`, and `order`.
 */
export interface ResolverField {
  readonly name: string;
  readonly mapsTo: FieldMapping | null;
  readonly order: number;
}

export interface ResolvedContactColumns {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  organization: string | null;
  designation: string | null;
}

/**
 * Resolve Contact column values from a registration submission, using
 * each FormField's `mapsTo` tag when present and falling back to
 * today's literal-key reads when not.
 *
 * Pure function — no DB access, no I/O. Reused by:
 *   - POST /api/register/[eventSlug]   (live registrations, Stage 2)
 *   - Stage 3 backfill                 (historical Registration.formData)
 *
 * Returned values are `string | null` per column. The caller is
 * responsible for:
 *   - Coercing null to "" for NOT NULL columns (firstName, lastName,
 *     email) on the create branch
 *   - Applying the existing "non-empty wins, else preserve existing"
 *     guard on the update branch (the `safeFirstName || contact.firstName`
 *     pattern at route.ts:475-480). The resolver intentionally does NOT
 *     know about existing Contact rows.
 *
 * Resolution order, per role:
 *   1. Mapped FULL_NAME field — split on first whitespace into
 *      firstName + lastName.
 *   2. Mapped FIRST_NAME / LAST_NAME / EMAIL / PHONE / ORGANIZATION /
 *      DESIGNATION field. LAST_NAME multi-field: parts joined in
 *      FormField.order order, separated by a single space, skipping
 *      empty-after-trim parts.
 *   3. Legacy literal-key read from formData ("firstName", "lastName",
 *      "email", "phone", "organization", "designation").
 *   4. (firstName + lastName only) Final rung — split legacyBodyFullName
 *      on first whitespace. Preserves the behavior of the
 *      route.ts:419-442 block this resolver supersedes; only fires when
 *      BOTH firstName and lastName are still null after rungs 1-3.
 *
 * Whitespace handling: readString trims its return value, returning
 * null for empty-after-trim. This is a small departure from the
 * legacy destructure (which wrote untrimmed values verbatim) — minor
 * positive change called out in the Stage 2 PR description.
 */
export function resolveContactColumns(
  registrationFields: readonly ResolverField[],
  formData: Record<string, unknown>,
  legacyBodyFullName: unknown
): ResolvedContactColumns {
  // Group tagged fields by role, pre-sorted by FormField.order so
  // LAST_NAME multi-field join is deterministic and FULL_NAME /
  // single-value `[0]` picks are stable across calls.
  const byRole = groupByRole(registrationFields);

  let firstName: string | null = null;
  let lastName: string | null = null;

  // Rung 1 — mapped FULL_NAME (mutually exclusive with FIRST/LAST per
  // validator; if drift exists, FULL_NAME wins).
  const fullNameField = byRole.get("FULL_NAME")?.[0];
  if (fullNameField) {
    // Validator (Stage 1 Chunk 2) enforces FULL_NAME mutual exclusion
    // with FIRST_NAME and LAST_NAME, so seeing them together means
    // the DB has drifted past what the validator allows (raw edit,
    // failed migration, ...). Warn loudly but DO NOT throw — a
    // registration submission must never crash on bad mapping state.
    if (byRole.has("FIRST_NAME") || byRole.has("LAST_NAME")) {
      console.warn(
        `[field-mapping] FULL_NAME drift detected on field "${fullNameField.name}": FIRST_NAME or LAST_NAME also tagged on the same event. Validator should have prevented this. FULL_NAME wins.`
      );
    }
    const raw = formData[fullNameField.name];
    if (typeof raw === "string") {
      const split = splitFullName(raw);
      if (split) {
        firstName = split.first;
        lastName = split.last;
      }
    }
  } else {
    // Rung 2 — mapped FIRST_NAME (single) + mapped LAST_NAME (multi).
    const firstNameField = byRole.get("FIRST_NAME")?.[0];
    if (firstNameField) {
      firstName = readString(formData, firstNameField.name);
    }
    const lastNameFields = byRole.get("LAST_NAME");
    if (lastNameFields && lastNameFields.length > 0) {
      const parts: string[] = [];
      for (const f of lastNameFields) {
        const v = readString(formData, f.name);
        if (v !== null) parts.push(v);
      }
      lastName = parts.length > 0 ? parts.join(" ") : null;
    }
  }

  // Rung 3 — legacy literal-key fallback for firstName / lastName.
  if (firstName === null) firstName = readString(formData, "firstName");
  if (lastName === null) lastName = readString(formData, "lastName");

  // Rung 4 — final-rung body.fullName splitter. Only fires when BOTH
  // firstName AND lastName are still null after rungs 1-3, matching
  // the `firstEmpty && lastEmpty` guard at route.ts:430.
  if (
    firstName === null &&
    lastName === null &&
    typeof legacyBodyFullName === "string"
  ) {
    const split = splitFullName(legacyBodyFullName);
    if (split) {
      firstName = split.first;
      lastName = split.last;
    }
  }

  // EMAIL / PHONE / ORGANIZATION / DESIGNATION — single-value, simple
  // "mapped if tagged, else legacy literal-key" chain. Email
  // lowercase + synthesis stays at the existing site in route.ts;
  // resolver only produces the raw input string.
  const email =
    singleMappedValue(byRole.get("EMAIL"), formData) ??
    readString(formData, "email");
  const phone =
    singleMappedValue(byRole.get("PHONE"), formData) ??
    readString(formData, "phone");
  const organization =
    singleMappedValue(byRole.get("ORGANIZATION"), formData) ??
    readString(formData, "organization");
  const designation =
    singleMappedValue(byRole.get("DESIGNATION"), formData) ??
    readString(formData, "designation");

  return { firstName, lastName, email, phone, organization, designation };
}

// ─── Internal helpers ──────────────────────────────────────────────

function groupByRole(
  fields: readonly ResolverField[]
): Map<FieldMapping, ResolverField[]> {
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  const byRole = new Map<FieldMapping, ResolverField[]>();
  for (const f of sorted) {
    if (f.mapsTo === null) continue;
    const existing = byRole.get(f.mapsTo);
    if (existing) {
      existing.push(f);
    } else {
      byRole.set(f.mapsTo, [f]);
    }
  }
  return byRole;
}

function singleMappedValue(
  fields: readonly ResolverField[] | undefined,
  formData: Record<string, unknown>
): string | null {
  if (!fields || fields.length === 0) return null;
  return readString(formData, fields[0].name);
}

function readString(
  source: Record<string, unknown>,
  key: string
): string | null {
  const raw = source[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Split a fullName string into first + (optional) last on the first
 * whitespace character. Trims input AND the last-name remainder, per
 * the existing route.ts:431-440 behavior this absorbs.
 *
 * Returns `null` if the trimmed input is empty.
 * Returns `{first, last: null}` for a single-word input (e.g.
 * "Mohamed") — null distinguishes "splitter ran, produced no last"
 * from "splitter did not run at all".
 */
function splitFullName(
  raw: string
): { first: string; last: string | null } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const idx = trimmed.search(/\s/);
  if (idx === -1) return { first: trimmed, last: null };
  const last = trimmed.slice(idx + 1).trim();
  return { first: trimmed.slice(0, idx), last: last || null };
}
