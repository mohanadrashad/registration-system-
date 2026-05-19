import { z } from "zod";
import {
  expectedUpdatedAtSchema,
  updatePhaseSelectionSchema,
} from "@/lib/validations/selection";

const optionalNullableString = z
  .union([z.string().min(1), z.null()])
  .optional();

const isoDateOrNull = z
  .union([z.string().datetime(), z.null()])
  .optional();

export const createPhaseSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  titleAr: optionalNullableString,
  description: optionalNullableString,
  descriptionAr: optionalNullableString,
  opensAt: isoDateOrNull,
  closesAt: isoDateOrNull,
  isRequired: z.boolean().optional(),
  reminderTemplateId: optionalNullableString,
  // Shape-only here; membership against Event.categories is a
  // per-event runtime check (validatePhaseCategoriesForEvent) — Zod
  // can't see the event's list.
  appliesToCategories: z.array(z.string()).optional(),
});

/**
 * Enforces that every category a phase is restricted to actually
 * exists on the parent event. Mirrors the Stage 1
 * `validateCategoryForEvent` pattern. Normalizes the array (trim,
 * drop blanks, dedupe). Empty array is valid and means "everyone".
 *
 * Returns the normalized value to persist, or a human-readable error.
 */
export function validatePhaseCategoriesForEvent(
  appliesToCategories: string[] | undefined,
  eventCategories: string[]
):
  | { ok: true; value: string[] | undefined }
  | { ok: false; error: string } {
  if (appliesToCategories === undefined) return { ok: true, value: undefined };

  const cleaned = Array.from(
    new Set(appliesToCategories.map((c) => c.trim()).filter((c) => c !== ""))
  );
  const unknown = cleaned.filter((c) => !eventCategories.includes(c));

  if (unknown.length > 0) {
    const list = `[${eventCategories.join(", ")}]`;
    return {
      ok: false,
      error:
        unknown.length === 1
          ? `Category '${unknown[0]}' is not in this event's categories list ${list}.`
          : `Categories [${unknown.join(
              ", "
            )}] are not in this event's categories list ${list}.`,
    };
  }

  return { ok: true, value: cleaned };
}

// Phase update accepts the base fields plus the Stage 2 selection fields
// in the same payload. Service layer enforces the REGISTRATION-phase guard.
// expectedUpdatedAt enables optimistic concurrency control on conflict-prone
// edits like the Options panel toggles.
export const updatePhaseSchema = createPhaseSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .merge(updatePhaseSelectionSchema)
  .merge(expectedUpdatedAtSchema);

export const reorderPhaseSchema = z.object({
  direction: z.enum(["up", "down"]),
});

export const createStepSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  titleAr: optionalNullableString,
  description: optionalNullableString,
  descriptionAr: optionalNullableString,
});

export const updateStepSchema = createStepSchema.partial();

export const reorderStepSchema = z.object({
  direction: z.enum(["up", "down"]),
});

export const moveFieldSchema = z.object({
  stepId: z.string().min(1),
});

// Per-attendee phase access override.
// `status: null` means "clear the override" (revert to date-based default).
export const setPhaseAccessSchema = z.object({
  phaseId: z.string().min(1),
  status: z.union([z.enum(["OPEN", "LOCKED"]), z.null()]),
  reason: z.string().max(500).nullable().optional(),
});
