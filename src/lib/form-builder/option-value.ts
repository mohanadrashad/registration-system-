/**
 * Option-value slugification for FormField options.
 *
 * Background: a FormField option has two display fields (`label`, `labelAr`)
 * and one identifier field (`value`). The `value` is what lands in
 * Registration.formData when an attendee picks the option, so it must be
 * stable, ASCII-only, and unique within the field.
 *
 * Today the form-builder slugifies inline (just lowercase + spaces→underscores
 * without stripping other characters). This module replaces those ad-hoc
 * usages with a single canonical rule so that:
 *   - the row's value chip,
 *   - the bulk-paste preview's value column,
 *   - any future auto-slug callsite
 * all produce the same result for the same input.
 *
 * Rules:
 *   - Lowercase.
 *   - Trim ends.
 *   - Whitespace runs → single underscore.
 *   - Anything other than [a-z0-9_] is stripped.
 *   - Leading/trailing underscores trimmed.
 *   - Empty result (e.g. an Arabic-only label) falls back to "option" — the
 *     caller usually combines this with the collision resolver below so the
 *     final slug becomes "option_2", "option_3", … if needed.
 *
 * The 100-char cap matches the Zod schema in validations/form-field.ts.
 */

const MAX_SLUG_LENGTH = 100;
const FALLBACK_SLUG = "option";

export function slugifyOptionValue(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
  return slug || FALLBACK_SLUG;
}

/**
 * Resolve a single candidate value against a set of already-used values by
 * appending _2, _3, … as needed. The candidate is mutated only if it
 * collides; otherwise it's returned as-is.
 *
 * Note: this does not insert the resolved value into the set. The caller
 * decides when to commit (see `slugifyAndResolve` for the batch variant).
 */
export function resolveValueCollision(
  candidate: string,
  used: ReadonlySet<string>
): string {
  if (!used.has(candidate)) return candidate;
  // Strip an existing `_N` suffix so re-resolving a previously-resolved
  // value doesn't compound (e.g. "books_2" → look for next free starting at
  // "books_3", not "books_2_2").
  const base = candidate.replace(/_\d+$/, "");
  let n = 2;
  // Use a generous upper bound to avoid infinite loops on pathological
  // inputs; admins won't realistically hit this.
  while (n < 1000 && used.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/**
 * Slugify a batch of labels and resolve collisions in a single pass. Useful
 * for the bulk-paste dialog, where 20 pasted labels need 20 unique values
 * including against any existing FormField.options the admin already has.
 *
 * @param labels - English labels in display order.
 * @param reserved - Existing values to treat as already used. Pass the
 *   current field's option values when appending new bulk-pasted items.
 * @returns One value per label, in the same order, all unique relative to
 *   each other and to `reserved`.
 */
export function slugifyAndResolve(
  labels: readonly string[],
  reserved: Iterable<string> = []
): string[] {
  const used = new Set<string>(reserved);
  return labels.map((label) => {
    const base = slugifyOptionValue(label);
    const resolved = resolveValueCollision(base, used);
    used.add(resolved);
    return resolved;
  });
}
