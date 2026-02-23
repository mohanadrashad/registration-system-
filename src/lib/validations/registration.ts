import { z } from "zod";

export const publicRegistrationSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  organization: z.string().optional(),
  designation: z.string().optional(),
});

export type PublicRegistrationInput = z.infer<typeof publicRegistrationSchema>;
