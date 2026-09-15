import { FastifyPluginAsync } from "fastify";
import { Role } from "@prisma/client";
import { advisorController } from "./advisor.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateBody, validateQuery, validateParams } from "../../utils/validate";
import {
  createStudentSchema,
  updateStudentSchema,
  getStudentsQuerySchema,
  getStaffQuerySchema,
  getAvailableStaffQuerySchema,
  createSubjectSchema,
  updateSubjectSchema,
  getSubjectsQuerySchema,
  mapStaffToSubjectSchema,
  getFeeVerificationsQuerySchema,
  approveFeeVerificationSchema,
  getAdvisorApprovalsQuerySchema,
  decideAdvisorApprovalSchema,
  getFinalVerificationQuerySchema,
  studentIdParamSchema,
  staffIdParamSchema,
  subjectIdParamSchema,
  subjectStaffParamSchema,
  CreateStudentInput,
  UpdateStudentInput,
  GetStudentsQuery,
  GetStaffQuery,
  GetAvailableStaffQuery,
  CreateSubjectInput,
  UpdateSubjectInput,
  GetSubjectsQuery,
  MapStaffToSubjectInput,
  GetFeeVerificationsQuery,
  ApproveFeeVerificationInput,
  GetAdvisorApprovalsQuery,
  DecideAdvisorApprovalInput,
  GetFinalVerificationQuery,
} from "./advisor.schema";

// All advisor routes require authentication + ADVISOR role.
// Classroom/department scoping is resolved server-side from the
// authenticated identity inside the service layer — never from client input.
const advisorGuard = [authenticate, authorize(Role.ADVISOR)];

export const advisorRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── Dashboard ────────────────────────────────────────────────────────────
  fastify.get("/dashboard", { preHandler: advisorGuard }, advisorController.getDashboard);

  // ─── Students (classroom scope) ───────────────────────────────────────────
  fastify.get<{ Querystring: GetStudentsQuery }>(
    "/students",
    {
      preHandler: advisorGuard,
      preValidation: [validateQuery(getStudentsQuerySchema)],
    },
    advisorController.getStudents
  );

  fastify.get<{ Params: { id: string } }>(
    "/students/:id",
    {
      preHandler: advisorGuard,
      preValidation: [validateParams(studentIdParamSchema)],
    },
    advisorController.getStudentById
  );

  fastify.post<{ Body: CreateStudentInput }>(
    "/students",
    {
      preHandler: advisorGuard,
      preValidation: [validateBody(createStudentSchema)],
    },
    advisorController.createStudent
  );

  fastify.patch<{ Params: { id: string }; Body: UpdateStudentInput }>(
    "/students/:id",
    {
      preHandler: advisorGuard,
      preValidation: [
        validateParams(studentIdParamSchema),
        validateBody(updateStudentSchema),
      ],
    },
    advisorController.updateStudent
  );

  // ─── Staff (assignment/discovery only; accounts are ADMIN-owned) ─────────
  // Staff account lifecycle lives in the admin module. Advisors may list their
  // assigned classroom staff, list eligible existing staff, and map staff to
  // subjects. Create/update are explicitly denied at the route level.

  fastify.get<{ Querystring: GetStaffQuery }>(
    "/staff",
    {
      preHandler: advisorGuard,
      preValidation: [validateQuery(getStaffQuerySchema)],
    },
    advisorController.getStaff
  );

  fastify.get<{ Querystring: GetAvailableStaffQuery }>(
    "/staff/available",
    {
      preHandler: advisorGuard,
      preValidation: [validateQuery(getAvailableStaffQuerySchema)],
    },
    advisorController.getAvailableStaff
  );

  fastify.get<{ Params: { id: string } }>(
    "/staff/:id",
    {
      preHandler: advisorGuard,
      preValidation: [validateParams(staffIdParamSchema)],
    },
    advisorController.getStaffById
  );

  // Admin-only operations — an advisor reaching these is always rejected 403.
  fastify.post(
    "/staff",
    { preHandler: advisorGuard },
    advisorController.createStaffDenied
  );

  fastify.patch<{ Params: { id: string } }>(
    "/staff/:id",
    {
      preHandler: advisorGuard,
      preValidation: [validateParams(staffIdParamSchema)],
    },
    advisorController.updateStaffDenied
  );

  // ─── Subjects (classroom scope) ───────────────────────────────────────────
  fastify.get<{ Querystring: GetSubjectsQuery }>(
    "/subjects",
    {
      preHandler: advisorGuard,
      preValidation: [validateQuery(getSubjectsQuerySchema)],
    },
    advisorController.getSubjects
  );

  fastify.get<{ Params: { id: string } }>(
    "/subjects/:id",
    {
      preHandler: advisorGuard,
      preValidation: [validateParams(subjectIdParamSchema)],
    },
    advisorController.getSubjectById
  );

  fastify.post<{ Body: CreateSubjectInput }>(
    "/subjects",
    {
      preHandler: advisorGuard,
      preValidation: [validateBody(createSubjectSchema)],
    },
    advisorController.createSubject
  );

  fastify.patch<{ Params: { id: string }; Body: UpdateSubjectInput }>(
    "/subjects/:id",
    {
      preHandler: advisorGuard,
      preValidation: [
        validateParams(subjectIdParamSchema),
        validateBody(updateSubjectSchema),
      ],
    },
    advisorController.updateSubject
  );

  // ─── Subject ↔ Staff mapping (both sides scope-validated) ─────────────────
  fastify.get<{ Params: { id: string } }>(
    "/subjects/:id/staff",
    {
      preHandler: advisorGuard,
      preValidation: [validateParams(subjectIdParamSchema)],
    },
    advisorController.getSubjectStaff
  );

  fastify.post<{ Params: { id: string }; Body: MapStaffToSubjectInput }>(
    "/subjects/:id/staff",
    {
      preHandler: advisorGuard,
      preValidation: [
        validateParams(subjectIdParamSchema),
        validateBody(mapStaffToSubjectSchema),
      ],
    },
    advisorController.mapStaffToSubject
  );

  fastify.delete<{ Params: { id: string; staffId: string } }>(
    "/subjects/:id/staff/:staffId",
    {
      preHandler: advisorGuard,
      preValidation: [validateParams(subjectStaffParamSchema)],
    },
    advisorController.unmapStaffFromSubject
  );

  // ─── Fee Verifications (classroom scope, OR rule) ───────────────────────
  fastify.get<{ Querystring: GetFeeVerificationsQuery }>(
    "/fees",
    {
      preHandler: advisorGuard,
      preValidation: [validateQuery(getFeeVerificationsQuerySchema)],
    },
    advisorController.getFeeVerifications
  );

  // ─── Approvals (Phase 7: advisor stage) ───────────────────────────────────
  fastify.get<{ Querystring: GetAdvisorApprovalsQuery }>(
    "/approvals",
    {
      preHandler: advisorGuard,
      preValidation: [validateQuery(getAdvisorApprovalsQuerySchema)],
    },
    advisorController.getApprovals
  );

  fastify.post<{ Body: DecideAdvisorApprovalInput }>(
    "/approvals",
    {
      preHandler: advisorGuard,
      // Approval spam protection on the state-changing decision endpoint.
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      preValidation: [validateBody(decideAdvisorApprovalSchema)],
    },
    advisorController.decideApproval
  );

  // Student fee verification (OR rule, atomic, idempotent)
  fastify.post<{ Body: ApproveFeeVerificationInput }>(
    "/fees/approve",
    {
      preHandler: advisorGuard,
      preValidation: [validateBody(approveFeeVerificationSchema)],
    },
    advisorController.approveFeeVerification
  );

  // ─── Final Verification (Phase 7 derived NoDue completion) ────────────────
  // Read-only, classroom-scoped. Effective state is re-derived from the
  // CURRENT approval pipeline (all subjects staff-approved AND advisor AND
  // HOD AND fee by advisor-or-hod) against the engine-persisted
  // Student.isVerified flag — a stale flag alone can never list a student
  // whose prerequisites are incomplete. No manual finalize action exists.
  // Only page/limit/search are accepted (validated server-side); client
  // classroom/advisor/department params are ignored entirely.
  fastify.get<{ Querystring: GetFinalVerificationQuery }>(
    "/final-verification",
    {
      preHandler: advisorGuard,
      preValidation: [validateQuery(getFinalVerificationQuerySchema)],
    },
    advisorController.getFinalVerifications
  );

  // ─── Bulk Subject & Student Import ───────────────────────────────────────
  fastify.post(
    "/subjects/bulk-import",
    { preHandler: advisorGuard },
    advisorController.bulkImportSubjects
  );

  fastify.get(
    "/subjects/template",
    { preHandler: advisorGuard },
    advisorController.downloadSubjectTemplate
  );

  fastify.post(
    "/students/bulk-import",
    { preHandler: advisorGuard },
    advisorController.bulkImportStudents
  );

  fastify.get(
    "/students/template",
    { preHandler: advisorGuard },
    advisorController.downloadStudentTemplate
  );

  // ─── Exportable Reports ───────────────────────────────────────────────────
  fastify.get(
    "/reports/defaulters/export",
    { preHandler: advisorGuard },
    advisorController.exportDefaulters
  );

  fastify.get(
    "/reports/clearance/export",
    { preHandler: advisorGuard },
    advisorController.exportClearanceSummary
  );
};
