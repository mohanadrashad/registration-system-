/**
 * Deep structural equality for JSON-shaped values.
 *
 * Used by the admin-edit and portal self-edit handlers to gate
 * Registration writes — when the incoming formData merges into an
 * unchanged value, skip the write so we don't bump Registration.updatedAt
 * or stamp Registration.updatedBy on a true no-op edit.
 *
 * JSON.stringify-based comparison is fragile here because Postgres jsonb
 * stores objects with sorted keys while client-parsed JSON preserves
 * insertion order — two semantically identical objects can serialize
 * to different strings. Recursive key-by-key comparison sidesteps that.
 *
 * Scope: scalars, null, arrays, plain objects. Doesn't handle Date,
 * Map, Set, etc. — they don't appear in Json-typed Prisma columns.
 */
export function isJsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const arrB = b as unknown[];
    if (a.length !== arrB.length) return false;
    return a.every((v, i) => isJsonEqual(v, arrB[i]));
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => isJsonEqual(objA[k], objB[k]));
}
