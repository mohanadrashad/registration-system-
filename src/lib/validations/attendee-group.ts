import { z } from "zod";

// Custom admin-managed grouping dimensions ("Ranking", "Region", …) and
// their managed value lists. Admin-internal — no bilingual siblings
// (matches the Event.categories precedent, which is English-only strings).

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #7EC43F");

export const groupCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  allowMultiple: z.boolean().optional().default(false),
});

export const groupUpdateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60).optional(),
  allowMultiple: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

export const groupValueCreateSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(60),
  color: hexColor.nullish(),
});

export const groupValueUpdateSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(60).optional(),
  color: hexColor.nullish(),
  order: z.number().int().min(0).optional(),
});

export type GroupCreateInput = z.infer<typeof groupCreateSchema>;
export type GroupUpdateInput = z.infer<typeof groupUpdateSchema>;
export type GroupValueCreateInput = z.infer<typeof groupValueCreateSchema>;
export type GroupValueUpdateInput = z.infer<typeof groupValueUpdateSchema>;

// ─── Assignment (Stage 2) ───

// Set a single contact's values for ONE group. Empty array clears the
// group for that contact. Single-value groups reject length > 1 (enforced
// in the route, where allowMultiple is known).
export const setContactGroupValuesSchema = z.object({
  valueIds: z.array(z.string().min(1)).max(200),
});

// Bulk-apply one value across many selected attendees.
//   set    — that value becomes the group's value for each contact
//            (replaces any existing values in this group)
//   add    — ensure the value is present (multi-value groups; coerced to
//            "set" for single-value groups in the route)
//   remove — ensure the value is absent
export const bulkAssignSchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(10_000),
  valueId: z.string().min(1),
  mode: z.enum(["set", "add", "remove"]),
});

export type SetContactGroupValuesInput = z.infer<
  typeof setContactGroupValuesSchema
>;
export type BulkAssignInput = z.infer<typeof bulkAssignSchema>;
