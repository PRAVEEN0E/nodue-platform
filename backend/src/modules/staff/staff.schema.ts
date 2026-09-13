import { z } from "zod";
import { ApprovalStatus } from "@prisma/client";

const paginationSchema = {
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
};

// ─── Subjects (read-only for staff; assigned via advisor mapping) ───────────

export const getStaffSubjectsQuerySchema = z.object({
  ...paginationSchema,
  search: z.string().trim().optional(),
  semester: z.coerce.number().int().min(1).max(8).optional(),
});

export const subjectIdParamSchema = z.object({
  id: z.string().uuid("Invalid subject ID format"),
});

export const classroomIdParamSchema = z.object({
  id: z.string().uuid("Invalid classroom ID format"),
});

// ─── Students (read-only; scoped through assigned subjects) ─────────────────

export const getStaffStudentsQuerySchema = z.object({
  ...paginationSchema,
  search: z.string().trim().optional(),
  subjectId: z.string().uuid().optional(),
  status: z.enum(["pending", "approved", "rejected", "decided"]).optional(),
});

export const studentIdParamSchema = z.object({
  id: z.string().uuid("Invalid student ID format"),
});

// ─── Approvals (staff subject-level decisions) ──────────────────────────────

export const getStaffApprovalsQuerySchema = z.object({
  ...paginationSchema,
  search: z.string().trim().optional(),
  subjectId: z.string().uuid().optional(),
  status: z.enum(["pending", "approved", "rejected", "decided"]).optional(),
});

export const decideApprovalSchema = z
  .object({
    studentId: z.string().uuid("Invalid student ID"),
    subjectId: z.string().uuid("Invalid subject ID"),
    decision: z.enum(["APPROVED", "REJECTED"]),
    remarks: z.string().max(500).trim().optional().nullable(),
  })
  .refine((v) => v.decision !== "REJECTED" || (v.remarks?.trim().length ?? 0) > 0, {
    message: "A reason is required when rejecting a student.",
    path: ["remarks"],
  });

export type GetStaffSubjectsQuery = z.infer<typeof getStaffSubjectsQuerySchema>;
export type GetStaffStudentsQuery = z.infer<typeof getStaffStudentsQuerySchema>;
export type GetStaffApprovalsQuery = z.infer<typeof getStaffApprovalsQuerySchema>;
export type DecideApprovalInput = z.infer<typeof decideApprovalSchema>;
export type ApprovalDecision = DecideApprovalInput["decision"];
export { ApprovalStatus };
