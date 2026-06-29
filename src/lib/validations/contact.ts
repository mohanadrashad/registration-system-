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
  // metadata is the legacy slot. Pre-Stage-1 clients folded formData
  // answers into this blob; the Stage 1 handler now writes formData
  // through a dedicated field. Kept here so the endpoint stays
  // backwards-compatible with any caller still on the old shape.
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const updateContactSchema = createContactSchema.partial().extend({
  // Email format is intentionally NOT enforced here (this overrides
  // createContactSchema's `.email()`). The PUT handler validates it only when
  // the email actually CHANGES — so a contact whose STORED email predates
  // current validation (a legacy import, an older registration) can still
  // have its other fields edited without being blocked on an email the admin
  // never touched. A new/changed email is still required to be valid.
  email: z.string().optional(),
  // Stage 1 admin-edit fix. The admin save flow sends non-Contact-column
  // form-field answers under this key. The handler merges them into
  // BOTH Contact.metadata (so existing reads keep working) AND
  // Registration.formData (so the CSV export and badge/email
  // renderers — which read formData — see admin corrections).
  // Not nullable: there's no "clear all answers" semantic; absence
  // means "don't touch formData."
  formData: z.record(z.string(), z.unknown()).optional(),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

// Standalone email-format check. The PUT handler uses it to validate a
// CHANGED email (updateContactSchema no longer enforces format inline — it
// grandfathers an unchanged legacy email so the contact stays editable).
export function isValidEmail(email: string): boolean {
  return z.string().email().safeParse(email).success;
}

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
