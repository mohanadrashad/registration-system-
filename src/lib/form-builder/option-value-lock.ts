/**
 * Value-lock guard for FormField options.
 *
 * Invariant: once any Registration.formData on the event references an
 * option `value`, that value may not disappear from the FormField.options
 * array. Labels stay editable; values are locked while in use.
 *
 * How we detect "disappear":
 *   removed = oldValues − newValues
 *
 * This catches both deletions (admin removed an option entirely) and
 * renames (admin edited the EN label, which re-slugified the value).
 * It does NOT try to detect "this is the same option with a new value" —
 * the array has no per-row stable identifier, so a slug change is
 * indistinguishable from a remove+add at the API boundary. That's
 * acceptable here because the policy ("don't break submissions") is
 * exactly satisfied by the disappearance check.
 *
 * formData shape per field type (see (public)/register/[eventSlug]/page.tsx):
 *   SELECT, RADIO    → formData[fieldName] = "<value>"  (string)
 *   MULTISELECT      → formData[fieldName] = ["<v1>", "<v2>", …]  (string[])
 *   CHECKBOX         → boolean (no option values used; never reaches this guard)
 */

import { FieldType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface OptionValueUsage {
  /** The option value that's still in use after the edit. */
  value: string;
  /** Number of Registration rows that reference this value. */
  registrationCount: number;
}

/**
 * Identify which of the `removedValues` are still referenced by any
 * Registration.formData on this event. Returns an empty array when none
 * are — the caller can then proceed with the PATCH.
 *
 * The query runs one Prisma `count` per removed value. For the realistic
 * upper bound (admin removes a handful of options in one PATCH) this is
 * fine. If a future workflow needs to remove hundreds at once we can
 * batch into a single SQL UNION or a raw query; not worth the complexity
 * today.
 */
export async function findReferencedOptionValues(params: {
  eventId: string;
  fieldName: string;
  fieldType: FieldType;
  removedValues: readonly string[];
}): Promise<OptionValueUsage[]> {
  const { eventId, fieldName, fieldType, removedValues } = params;
  if (removedValues.length === 0) return [];

  const results: OptionValueUsage[] = [];

  for (const value of removedValues) {
    let where: Prisma.RegistrationWhereInput;

    if (fieldType === FieldType.MULTISELECT) {
      // Prisma's `array_contains` on a Json column with `path` performs
      // the Postgres JSONB `@>` check at the array key — matches when
      // the array at formData[fieldName] contains the value.
      where = {
        eventId,
        formData: {
          path: [fieldName],
          array_contains: value,
        },
      };
    } else if (
      fieldType === FieldType.SELECT ||
      fieldType === FieldType.RADIO
    ) {
      where = {
        eventId,
        formData: {
          path: [fieldName],
          equals: value,
        },
      };
    } else {
      // Non-option-bearing field type slipped through — defensive no-op.
      continue;
    }

    const count = await prisma.registration.count({ where });
    if (count > 0) {
      results.push({ value, registrationCount: count });
    }
  }

  return results;
}
