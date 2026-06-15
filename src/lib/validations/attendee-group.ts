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
