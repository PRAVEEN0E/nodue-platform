import { z } from "zod";
import { Role } from "@prisma/client";

export const loginSchema = z.object({
  email: z.string().min(2, "Identifier must be at least 2 characters").toLowerCase().trim(),
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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
  keepCurrentSession: z.boolean().optional().default(true),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;



export const revokeSessionParamsSchema = z.object({
  sessionId: z.string().uuid("Invalid session ID format"),
});

export type RevokeSessionParams = z.infer<typeof revokeSessionParamsSchema>;

export const revokeAllSessionsBodySchema = z.object({
  keepCurrentSession: z.boolean().optional().default(true),
});

export type RevokeAllSessionsBody = z.infer<typeof revokeAllSessionsBodySchema>;

