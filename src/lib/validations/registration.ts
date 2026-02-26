import { z } from "zod";

export const publicRegistrationSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(1, "Phone is required"),
  organization: z.string().min(1, "Organization is required"),
  designation: z.string().min(1, "Designation is required"),
});

export type PublicRegistrationInput = z.infer<typeof publicRegistrationSchema>;
