import { z } from "zod";
import { FieldMapping, FieldType } from "@prisma/client";
import {
  COMPATIBLE_FIELD_TYPES,
  FIELD_MAPPING_LABELS,
  FULL_NAME_EXCLUSIVE_ROLES,
  MULTI_VALUE_ROLES,
} from "@/lib/form-builder/field-mapping-labels";

/**
 * PATCH body shape for the mapsTo branch on the form-field route.
 *
 *   undefined — caller did not include `mapsTo`; the column is left
 *               untouched. This is the patch-style default.
 *   null      — clear the mapping (admin selected "Not mapped").
 *   enum val  — assign the mapping to this role.
 */
export const mapsToInputSchema = z
  .union([z.literal(null), z.nativeEnum(FieldMapping)])
  .optional();

/**
 * POST body shape for the atomic swap endpoint.
 *
 *   fromFieldId — the field that currently holds `role` and will lose it.
 *   role        — the role being transferred to the URL field.
 *
 * The URL `fieldId` is the recipient. The single-role body deviates from
 * the spec's `{ from: {fieldId, mapsTo}, to: {fieldId, mapsTo} }` shape
 * because a swap by definition transfers the same role — repeating it
 * twice is redundant and creates a footgun if the two sides disagree.
 */
export const swapMappingSchema = z.object({
  fromFieldId: z.string().min(1, "fromFieldId is required"),
  role: z.nativeEnum(FieldMapping),
});

export const MAPPING_ERROR_CODES = {
  TYPE_INCOMPATIBLE: "MAPPING_TYPE_INCOMPATIBLE",
  ROLE_CONFLICT: "MAPPING_CONFLICT",
  FULL_NAME_EXCLUSION: "MAPPING_MUTUAL_EXCLUSION",
  SWAP_STALE: "MAPPING_SWAP_STALE",
} as const;

export type MappingErrorCode =
  (typeof MAPPING_ERROR_CODES)[keyof typeof MAPPING_ERROR_CODES];

interface ExistingFieldForCheck {
  id: string;
  name: string;
  label: string;
  type: FieldType;
  mapsTo: FieldMapping | null;
}

type CheckResult =
  | { ok: true }
  | {
      ok: false;
      status: 400 | 409;
      code: MappingErrorCode;
      message: string;
      conflict: Record<string, unknown>;
    };

/**
 * Pure validator for a candidate `mapsTo` change. The route handler is
 * expected to load all FormFields for the event (id/name/label/type/mapsTo
 * is enough) and call this before any DB write.
 *
 * Setting `candidateRole = null` (clearing) always passes — unmapping
 * cannot create a conflict.
 *
 * The checks, in order:
 *  1. Type compatibility — candidate field's type must be in
 *     COMPATIBLE_FIELD_TYPES[role]. (Client-side dropdown filter mirror.)
 *  2. Single-value uniqueness — for non-multi-value roles, no other field
 *     on the event may already carry the role.
 *  3. FULL_NAME mutual exclusion — picking FULL_NAME while FIRST_NAME or
 *     LAST_NAME is held (or vice versa) is rejected.
 */
export function checkMappingConflict(
  candidate: {
    fieldId: string;
    type: FieldType;
    role: FieldMapping | null;
  },
  existingFields: readonly ExistingFieldForCheck[]
): CheckResult {
  if (candidate.role === null) return { ok: true };
  const role = candidate.role;

  // 1. Type compatibility
  const compatibleTypes = COMPATIBLE_FIELD_TYPES[role];
  if (!compatibleTypes.has(candidate.type)) {
    return {
      ok: false,
      status: 400,
      code: MAPPING_ERROR_CODES.TYPE_INCOMPATIBLE,
      message: `${FIELD_MAPPING_LABELS[role]} cannot be mapped to a ${candidate.type} field`,
      conflict: {
        role,
        fieldType: candidate.type,
        compatibleTypes: [...compatibleTypes],
      },
    };
  }

  // 2. Single-value uniqueness (skip for multi-value roles like LAST_NAME)
  if (!MULTI_VALUE_ROLES.has(role)) {
    const existingHolder = existingFields.find(
      (f) => f.id !== candidate.fieldId && f.mapsTo === role
    );
    if (existingHolder) {
      return {
        ok: false,
        status: 409,
        code: MAPPING_ERROR_CODES.ROLE_CONFLICT,
        message: `${FIELD_MAPPING_LABELS[role]} is already mapped to "${existingHolder.label}"`,
        conflict: {
          role,
          existingField: {
            id: existingHolder.id,
            name: existingHolder.name,
            label: existingHolder.label,
          },
        },
      };
    }
  }

  // 3. FULL_NAME mutual exclusion
  if (role === "FULL_NAME") {
    const blocker = existingFields.find(
      (f) => f.id !== candidate.fieldId && f.mapsTo !== null && FULL_NAME_EXCLUSIVE_ROLES.has(f.mapsTo)
    );
    if (blocker) {
      return {
        ok: false,
        status: 409,
        code: MAPPING_ERROR_CODES.FULL_NAME_EXCLUSION,
        message: `FULL_NAME is mutually exclusive with FIRST_NAME and LAST_NAME. Untag "${blocker.label}" first.`,
        conflict: {
          role,
          blockingField: {
            id: blocker.id,
            name: blocker.name,
            label: blocker.label,
            mapsTo: blocker.mapsTo,
          },
        },
      };
    }
  } else if (FULL_NAME_EXCLUSIVE_ROLES.has(role)) {
    const fullNameHolder = existingFields.find(
      (f) => f.id !== candidate.fieldId && f.mapsTo === "FULL_NAME"
    );
    if (fullNameHolder) {
      return {
        ok: false,
        status: 409,
        code: MAPPING_ERROR_CODES.FULL_NAME_EXCLUSION,
        message: `${FIELD_MAPPING_LABELS[role]} is mutually exclusive with FULL_NAME. Untag "${fullNameHolder.label}" first.`,
        conflict: {
          role,
          blockingField: {
            id: fullNameHolder.id,
            name: fullNameHolder.name,
            label: fullNameHolder.label,
            mapsTo: fullNameHolder.mapsTo,
          },
        },
      };
    }
  }

  return { ok: true };
}
