import { z } from "zod";
import { updatePhaseSelectionSchema } from "@/lib/validations/selection";

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
});

// Phase update accepts the base fields plus the Stage 2 selection fields
// in the same payload. Service layer enforces the REGISTRATION-phase guard.
export const updatePhaseSchema = createPhaseSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .merge(updatePhaseSelectionSchema);

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
