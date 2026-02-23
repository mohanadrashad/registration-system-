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
});

export const updateContactSchema = createContactSchema.partial();

export type CreateContactInput = z.infer<typeof createContactSchema>;
