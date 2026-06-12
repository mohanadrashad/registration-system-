import { z } from "zod";
import { UserRole } from "@prisma/client";

export const userCreateSchema = z.object({
  name: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().email("A valid email address is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.nativeEnum(UserRole),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().email("A valid email address is required").optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  role: z.nativeEnum(UserRole).optional(),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
