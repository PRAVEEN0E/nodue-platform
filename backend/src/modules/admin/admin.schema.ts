import { z } from "zod";
import { Role } from "@prisma/client";

// ─── HOD Creation ───────────────────────────────────────────────────────────

export const createHodSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters").trim(),
  lastName: z.string().min(2, "Last name must be at least 2 characters").trim(),
  email: z.string().email("Invalid email address").toLowerCase().trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
  departmentId: z.string().uuid("Invalid department ID"),
});

export type CreateHodInput = z.infer<typeof createHodSchema>;

// ─── Update HOD Status ───────────────────────────────────────────────────────

export const updateHodStatusSchema = z.object({
  isActive: z.boolean(),
});

export type UpdateHodStatusInput = z.infer<typeof updateHodStatusSchema>;

// ─── Users Query ─────────────────────────────────────────────────────────────

export const getUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  role: z.nativeEnum(Role).optional(),
  departmentId: z.string().uuid().optional(),
  isActive: z.enum(["true", "false"]).optional().transform((val) => {
    if (val === "true") return true;
    if (val === "false") return false;
    return undefined;
  }),
});

export type GetUsersQuery = z.infer<typeof getUsersQuerySchema>;

// ─── HODs Query ──────────────────────────────────────────────────────────────

export const getHodsQuerySchema = z.object({
  search: z.string().trim().optional(),
  departmentId: z.string().uuid().optional(),
  isActive: z.enum(["true", "false"]).optional().transform((val) => {
    if (val === "true") return true;
    if (val === "false") return false;
    return undefined;
  }),
});

export type GetHodsQuery = z.infer<typeof getHodsQuerySchema>;

// ─── Audit Logs Query ────────────────────────────────────────────────────────

export const getAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().optional(),
  entityType: z.string().trim().optional(),
  actorUserId: z.string().uuid().optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
});

export type GetAuditLogsQuery = z.infer<typeof getAuditLogsQuerySchema>;

// ─── Staff Management (ADMIN-only lifecycle; advisors never create/edit) ────

export const createStaffSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters").max(50).trim(),
  lastName: z.string().min(2, "Last name must be at least 2 characters").max(50).trim(),
  email: z.string().email("Invalid email address").toLowerCase().trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
  employeeCode: z.string().min(2, "Employee code must be at least 2 characters").max(30).trim(),
  designation: z.string().min(2, "Designation must be at least 2 characters").max(80).trim(),
  departmentId: z.string().uuid("Invalid department ID"),
  isActive: z.boolean().optional().default(true),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = z.object({
  firstName: z.string().min(2).max(50).trim().optional(),
  lastName: z.string().min(2).max(50).trim().optional(),
  email: z.string().email("Invalid email address").toLowerCase().trim().optional(),
  designation: z.string().min(2).max(80).trim().optional(),
  departmentId: z.string().uuid("Invalid department ID").optional(),
  isActive: z.boolean().optional(),
});

export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const getStaffQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  departmentId: z.string().uuid().optional(),
  isActive: z.enum(["true", "false"]).optional().transform((val) => {
    if (val === "true") return true;
    if (val === "false") return false;
    return undefined;
  }),
});

export type GetStaffQuery = z.infer<typeof getStaffQuerySchema>;

// ─── Route Params ────────────────────────────────────────────────────────────

export const hodIdParamSchema = z.object({
  id: z.string().uuid("Invalid HOD user ID"),
});

export const staffIdParamSchema = z.object({
  id: z.string().uuid("Invalid staff ID"),
});
