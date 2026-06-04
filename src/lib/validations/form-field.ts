import { z } from "zod";
import { OptionColumns } from "@prisma/client";
import { OTHER_VALUE } from "@/lib/form-builder/options-parse";

/**
 * Per-field MULTISELECT card-grid column setting (Feature B). Bound to the
 * Prisma enum so the three values stay in lockstep with the schema.
 */
export const optionColumnsSchema = z.nativeEnum(OptionColumns);

/**
 * Shape of a single FormField option as stored in FormField.options (Json).
 *
 *   value   — the identifier that lands in Registration.formData when an
 *             attendee selects this option. ASCII-only by convention
 *             (slugify-produced), but the schema doesn't enforce that
 *             because legacy data may include other characters; the value-
 *             lock guard treats values as opaque strings.
 *   label   — English display label.
 *   labelAr — Arabic display label. Optional/nullable so existing options
 *             without an Arabic translation continue to validate.
 */
export const fieldOptionSchema = z.object({
  value: z
    .string()
    .min(1, "Option value is required")
    .max(100)
    .refine((v) => v !== OTHER_VALUE, {
      message: `"${OTHER_VALUE}" is a reserved value for the Other choice`,
    }),
  label: z.string().min(1, "Option label is required").max(200),
  labelAr: z
    .union([z.string().max(200), z.null()])
    .optional(),
});

export type FieldOptionInput = z.infer<typeof fieldOptionSchema>;

/**
 * Array form. Cap at 500 — comfortably above any realistic options list
 * (the productive-families case is ~20). The bulk-paste dialog caps its
 * own single-batch translate call at 100; multiple bulk operations can
 * accumulate beyond that, hence the higher per-field ceiling here.
 */
export const fieldOptionsArraySchema = z
  .array(fieldOptionSchema)
  .max(500, "At most 500 options per field");

/**
 * Custom refinement: every `value` in the array must be unique. Returns
 * the validated array (with the same shape) so the route handler can pass
 * it straight into Prisma's update.
 */
export const fieldOptionsArrayUniqueSchema = fieldOptionsArraySchema.superRefine(
  (options, ctx) => {
    const seen = new Set<string>();
    options.forEach((opt, index) => {
      if (seen.has(opt.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "value"],
          message: `Duplicate option value "${opt.value}". Values must be unique within a field.`,
        });
      }
      seen.add(opt.value);
    });
  }
);

/**
 * Wrapped options shape: same options array plus optional "Other" config
 * and max-selections. Either feature being set turns the on-disk shape
 * from legacy array into the wrapped object — see options-parse.ts.
 */
export const otherConfigSchema = z.object({
  enabled: z.literal(true),
  label: z.string().max(200).optional(),
  labelAr: z.string().max(200).optional(),
  placeholder: z.string().max(200).optional(),
  placeholderAr: z.string().max(200).optional(),
});

export const fieldOptionsWrappedSchema = z.object({
  options: fieldOptionsArrayUniqueSchema,
  other: otherConfigSchema.optional(),
  maxSelections: z.number().int().min(0).max(500).optional(),
  showSelectionCounter: z.boolean().optional(),
});

/**
 * Accepts either legacy array or new wrapped shape. PUT/POST handlers
 * for form fields should validate against this and let the serializer
 * decide which shape to persist.
 */
export const fieldOptionsInputSchema = z.union([
  fieldOptionsArrayUniqueSchema,
  fieldOptionsWrappedSchema,
]);
