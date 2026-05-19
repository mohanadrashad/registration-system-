import { z } from "zod";

export const createContactSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().nullable().optional(),
  organization: z.string().nullable().optional(),
  designation: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  status: z.enum(["IMPORTED", "INVITED", "REGISTERED", "CANCELLED"]).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const updateContactSchema = createContactSchema.partial();

export type CreateContactInput = z.infer<typeof createContactSchema>;

/**
 * Enforces that a contact's category is either absent, NULL, or one of
 * the strings defined on the parent event. Empty string is coerced to
 * NULL (an empty category is not a value). The allowed list is
 * per-event runtime data, so this is a function rather than a static
 * Zod refinement.
 *
 * Returns the normalized value to persist, or a human-readable error.
 */
export function validateCategoryForEvent(
  category: string | null | undefined,
  eventCategories: string[]
):
  | { ok: true; value: string | null | undefined }
  | { ok: false; error: string } {
  // Field omitted entirely (e.g. a PUT that doesn't touch category):
  // leave it untouched.
  if (category === undefined) return { ok: true, value: undefined };

  // null or empty string → cleared category.
  if (category === null || category.trim() === "") {
    return { ok: true, value: null };
  }

  const value = category.trim();
  if (eventCategories.includes(value)) {
    return { ok: true, value };
  }

  return {
    ok: false,
    error: `Category '${value}' is not in this event's categories list [${eventCategories.join(
      ", "
    )}].`,
  };
}
