import { z } from "zod";

/**
 * Validation for POST /api/translate.
 *
 * Limits:
 *   - At most 100 strings per request — enough for the bulk-paste preview
 *     "Translate all" button (we cap bulk-paste itself well below this).
 *   - Each string ≤ 500 chars — MyMemory rejects much longer inputs; the
 *     cap also stops admins from pasting a whole article into a label.
 *   - Empty strings are allowed at the schema layer; the service decides
 *     what to return for them (an `error` result, not a 400).
 */
export const translateRequestSchema = z.object({
  strings: z
    .array(z.string().max(500, "Each string must be at most 500 characters"))
    .min(1, "At least one string is required")
    .max(100, "At most 100 strings per request"),
  from: z.enum(["en", "ar"]),
  to: z.enum(["en", "ar"]),
});

export type TranslateRequestInput = z.infer<typeof translateRequestSchema>;
