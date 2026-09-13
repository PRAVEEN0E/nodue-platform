import { z } from "zod";
import { Role } from "@prisma/client";

export const loginSchema = z.object({
  email: z.string().email("Invalid email address format").toLowerCase().trim(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.nativeEnum(Role),
  departmentId: z.string().uuid().nullable().optional(),
  department: z
    .object({
      id: z.string().uuid(),
      code: z.string(),
      name: z.string(),
    })
    .nullable()
    .optional(),
  createdAt: z.date(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;
