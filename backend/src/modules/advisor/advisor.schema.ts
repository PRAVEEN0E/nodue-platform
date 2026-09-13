import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const paginationSchema = {
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
};

const isActiveFilter = z
  .enum(["true", "false"])
  .transform((val) => val === "true")
  .optional();

// ─── Students ───────────────────────────────────────────────────────────────

export const createStudentSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters").max(50).trim(),
  lastName: z.string().min(2, "Last name must be at least 2 characters").max(50).trim(),
  email: z.string().email("Invalid email address").toLowerCase().trim(),
  password: passwordSchema,
  registerNumber: z.string().min(3, "Register number must be at least 3 characters").max(30).trim(),
  rollNumber: z.string().max(30).trim().optional().nullable(),
  admissionYear: z.coerce
    .number()
    .int("Admission year must be an integer")
    .min(2000, "Admission year must be 2000 or later")
    .max(2100, "Admission year must be 2100 or earlier"),
});

export const updateStudentSchema = z.object({
  firstName: z.string().min(2).max(50).trim().optional(),
  lastName: z.string().min(2).max(50).trim().optional(),
  email: z.string().email("Invalid email address").toLowerCase().trim().optional(),
  isActive: z.boolean().optional(),
  rollNumber: z.string().max(30).trim().nullable().optional(),
  admissionYear: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const getStudentsQuerySchema = z.object({
  ...paginationSchema,
  search: z.string().trim().optional(),
  isActive: isActiveFilter,
});

// ─── Staff (assignment/discovery only; staff accounts are ADMIN-owned) ─────

export const getStaffQuerySchema = z.object({
  ...paginationSchema,
  search: z.string().trim().optional(),
  isActive: isActiveFilter,
});

// Eligible existing staff for assignment: same department, active, not already
// mapped into this advisor's classroom's subjects. Includes the unassigned
// pool (adoptable) and cross-classroom staff of the same department.
export const getAvailableStaffQuerySchema = z.object({
  ...paginationSchema,
  search: z.string().trim().optional(),
});

// ─── Subjects ───────────────────────────────────────────────────────────────

export const createSubjectSchema = z.object({
  code: z.string().min(2, "Subject code must be at least 2 characters").max(20).trim(),
  name: z.string().min(2, "Subject name must be at least 2 characters").max(100).trim(),
  credits: z.coerce.number().int().min(1).max(10).default(3),
  semester: z.coerce.number().int().min(1, "Semester must be between 1 and 8").max(8, "Semester must be between 1 and 8"),
});

export const updateSubjectSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  credits: z.coerce.number().int().min(1).max(10).optional(),
  semester: z.coerce.number().int().min(1).max(8).optional(),
});

export const getSubjectsQuerySchema = z.object({
  ...paginationSchema,
  search: z.string().trim().optional(),
  semester: z.coerce.number().int().min(1).max(8).optional(),
});

export const mapStaffToSubjectSchema = z.object({
  staffId: z.string().uuid("Invalid staff ID"),
});

// ─── Fee Verifications ─────────────────────────────────────────────────────

export const getFeeVerificationsQuerySchema = z.object({
  ...paginationSchema,
  search: z.string().trim().optional(),
  status: z.enum(["PENDING", "VERIFIED"]).optional(),
});

export const approveFeeVerificationSchema = z.object({
  studentId: z.string().uuid("Invalid student ID"),
});

// ─── Approvals (Phase 7: advisor stage of the approval engine) ─────────────

export const getAdvisorApprovalsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(["pending", "approved", "rejected", "decided"]).default("pending"),
});

export const decideAdvisorApprovalSchema = z
  .object({
    studentId: z.string().uuid("Invalid student ID"),
    decision: z.enum(["APPROVED", "REJECTED"]),
    remarks: z.string().max(500).trim().optional().nullable(),
  })
  .refine((v) => v.decision !== "REJECTED" || (v.remarks?.trim().length ?? 0) > 0, {
    message: "A reason is required when rejecting a student.",
    path: ["remarks"],
  });

// ─── Final Verification (Phase 7 derived NoDue completion) ─────────────────
// Read-only list of students in the advisor's classroom whose overall NoDue
// process is complete. Effective state is re-derived from the CURRENT
// approval pipeline (all subjects staff-approved AND advisor AND HOD approved
// AND fee verified by advisor OR hod) combined with the engine-persisted
// Student.isVerified flag — a stale flag alone can never list a student whose
// prerequisites are incomplete. No client-controlled classroom/advisor query
// parameters are accepted — only the authenticated scope + pagination +
// search are validated.
export const getFinalVerificationQuerySchema = z.object({
  ...paginationSchema,
  search: z.string().trim().optional(),
});



// ─── Route Params ───────────────────────────────────────────────────────────

export const studentIdParamSchema = z.object({
  id: z.string().uuid("Invalid student ID format"),
});

export const staffIdParamSchema = z.object({
  id: z.string().uuid("Invalid staff ID format"),
});

export const subjectIdParamSchema = z.object({
  id: z.string().uuid("Invalid subject ID format"),
});

export const subjectStaffParamSchema = z.object({
  id: z.string().uuid("Invalid subject ID format"),
  staffId: z.string().uuid("Invalid staff ID format"),
});



// ─── Inferred Types ─────────────────────────────────────────────────────────

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
export type GetStudentsQuery = z.infer<typeof getStudentsQuerySchema>;

export type GetStaffQuery = z.infer<typeof getStaffQuerySchema>;
export type GetAvailableStaffQuery = z.infer<typeof getAvailableStaffQuerySchema>;

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
export type GetSubjectsQuery = z.infer<typeof getSubjectsQuerySchema>;
export type MapStaffToSubjectInput = z.infer<typeof mapStaffToSubjectSchema>;

export type GetFeeVerificationsQuery = z.infer<typeof getFeeVerificationsQuerySchema>;
export type ApproveFeeVerificationInput = z.infer<typeof approveFeeVerificationSchema>;
export type GetAdvisorApprovalsQuery = z.infer<typeof getAdvisorApprovalsQuerySchema>;
export type DecideAdvisorApprovalInput = z.infer<typeof decideAdvisorApprovalSchema>;
export type GetFinalVerificationQuery = z.infer<typeof getFinalVerificationQuerySchema>;
