import { z } from "zod";

// ─── Classroom Schemas ────────────────────────────────────────────────────────

export const createClassroomSchema = z.object({
  name: z.string().min(2, "Classroom name must be at least 2 characters").max(100).trim(),
  batch: z.string().min(4, "Batch must be at least 4 characters").max(20).trim(),
  semester: z.coerce.number().int().min(1, "Semester must be between 1 and 8").max(8, "Semester must be between 1 and 8"),
  section: z.string().min(1, "Section must be at least 1 character").max(10).trim().toUpperCase(),
});

export const updateClassroomSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  batch: z.string().min(4).max(20).trim().optional(),
  semester: z.coerce.number().int().min(1).max(8).optional(),
  section: z.string().min(1).max(10).trim().toUpperCase().optional(),
});

export const getClassroomsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  semester: z.coerce.number().int().min(1).max(8).optional(),
  batch: z.string().optional(),
  section: z.string().optional(),
});

// ─── Advisor Schemas ──────────────────────────────────────────────────────────

export const createAdvisorSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters").max(50).trim(),
  lastName: z.string().min(2, "Last name must be at least 2 characters").max(50).trim(),
  email: z.string().email("Invalid email address").toLowerCase().trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  classroomId: z.string().uuid("Invalid classroom ID").optional().nullable(),
});

export const updateAdvisorSchema = z.object({
  firstName: z.string().min(2).max(50).trim().optional(),
  lastName: z.string().min(2).max(50).trim().optional(),
  isActive: z.boolean().optional(),
});

export const getAdvisorsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  classroomId: z.string().uuid().optional(),
});

export const assignAdvisorClassroomSchema = z.object({
  classroomId: z.string().uuid("Invalid classroom ID").nullable(),
});

// ─── Department Schemas ───────────────────────────────────────────────────────

export const updateDepartmentSchema = z.object({
  name: z.string().min(3, "Department name must be at least 3 characters").max(100).trim(),
});

// ─── Audit Log Query Schema ───────────────────────────────────────────────────

export const getHodAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  action: z.string().optional(),
  entityType: z.string().optional(),
  actorUserId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// ─── Approvals (Phase 7: HOD stage of the approval engine) ──────────────────

export const getHodApprovalsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(["pending", "approved", "rejected", "decided"]).default("pending"),
});

export const decideHodApprovalSchema = z
  .object({
    studentId: z.string().uuid("Invalid student ID"),
    decision: z.enum(["APPROVED", "REJECTED"]),
    remarks: z.string().max(500).trim().optional().nullable(),
  })
  .refine((v) => v.decision !== "REJECTED" || (v.remarks?.trim().length ?? 0) > 0, {
    message: "A reason is required when rejecting a student.",
    path: ["remarks"],
  });

export const getHodFeesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(["PENDING", "VERIFIED"]).optional(),
  classroomId: z.string().uuid().optional(),
});

export const approveFeeVerificationSchema = z.object({
  studentId: z.string().uuid("Invalid student ID"),
});

// ─── Param Schemas ────────────────────────────────────────────────────────────

export const classroomIdParamSchema = z.object({
  id: z.string().uuid("Invalid classroom ID format"),
});

export const advisorIdParamSchema = z.object({
  id: z.string().uuid("Invalid advisor ID format"),
});

export const assignAdvisorParamSchema = z.object({
  advisorId: z.string().uuid("Invalid advisor ID format"),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type CreateClassroomInput = z.infer<typeof createClassroomSchema>;
export type UpdateClassroomInput = z.infer<typeof updateClassroomSchema>;
export type GetClassroomsQuery = z.infer<typeof getClassroomsQuerySchema>;

export type CreateAdvisorInput = z.infer<typeof createAdvisorSchema>;
export type UpdateAdvisorInput = z.infer<typeof updateAdvisorSchema>;
export type GetAdvisorsQuery = z.infer<typeof getAdvisorsQuerySchema>;
export type AssignAdvisorClassroomInput = z.infer<typeof assignAdvisorClassroomSchema>;

export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type GetHodAuditLogsQuery = z.infer<typeof getHodAuditLogsQuerySchema>;
export type GetHodApprovalsQuery = z.infer<typeof getHodApprovalsQuerySchema>;
export type DecideHodApprovalInput = z.infer<typeof decideHodApprovalSchema>;
export type GetHodFeesQuery = z.infer<typeof getHodFeesQuerySchema>;
export type ApproveFeeVerificationInput = z.infer<typeof approveFeeVerificationSchema>;
