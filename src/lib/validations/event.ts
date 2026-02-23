import { z } from "zod";

export const createEventSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  venue: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  categories: z.array(z.string()).optional(),
});

export const updateEventSchema = createEventSchema.partial();

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
