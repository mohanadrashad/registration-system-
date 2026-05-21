import { z } from "zod";

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
  value: z.string().min(1, "Option value is required").max(100),
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
