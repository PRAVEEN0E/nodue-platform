import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { Role } from "@prisma/client";
import { hodController } from "./hod.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { ForbiddenError } from "../../utils/errors";
import { prisma } from "../../plugins/database";
import { validateBody, validateQuery, validateParams } from "../../utils/validate";
import {
  createClassroomSchema,
  updateClassroomSchema,
  getClassroomsQuerySchema,
  classroomIdParamSchema,
  createAdvisorSchema,
  updateAdvisorSchema,
  getAdvisorsQuerySchema,
  advisorIdParamSchema,
  assignAdvisorClassroomSchema,
  assignAdvisorParamSchema,
  updateDepartmentSchema,
  getHodAuditLogsQuerySchema,
  getHodApprovalsQuerySchema,
  decideHodApprovalSchema,
  getHodFeesQuerySchema,
  approveFeeVerificationSchema,
  CreateClassroomInput,
  UpdateClassroomInput,
  GetClassroomsQuery,
  CreateAdvisorInput,
  UpdateAdvisorInput,
  GetAdvisorsQuery,
  AssignAdvisorClassroomInput,
  UpdateDepartmentInput,
  GetHodAuditLogsQuery,
  GetHodApprovalsQuery,
  DecideHodApprovalInput,
  GetHodFeesQuery,
  ApproveFeeVerificationInput,
} from "./hod.schema";

// ─── Department Scoping Middleware ────────────────────────────────────────────

async function requireHodDepartment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  let departmentId = request.user?.departmentId;

  // If departmentId was not present in the token, verify against database
  if (!departmentId && request.user?.userId) {
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { departmentId: true, role: true },
    });

    if (user?.departmentId) {
      departmentId = user.departmentId;
    }
  }

  if (!departmentId) {
    throw new ForbiddenError("HOD account is not assigned to any academic department.");
  }

  request.departmentId = departmentId;
}

// All HOD routes require: authentication + HOD role authorization + department scope resolution
const hodGuard = [authenticate, authorize(Role.HOD), requireHodDepartment];

export const hodRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── Dashboard & Department Overview ────────────────────────────────────────
  fastify.get("/dashboard", { preHandler: hodGuard }, hodController.getDashboard);

  fastify.get("/department", { preHandler: hodGuard }, hodController.getDepartment);

  fastify.patch<{ Body: UpdateDepartmentInput }>(
    "/department",
    {
      preHandler: hodGuard,
      preValidation: [validateBody(updateDepartmentSchema)],
    },
    hodController.updateDepartment
  );

  // ─── Classrooms ─────────────────────────────────────────────────────────────
  fastify.get<{ Querystring: GetClassroomsQuery }>(
    "/classrooms",
    {
      preHandler: hodGuard,
      preValidation: [validateQuery(getClassroomsQuerySchema)],
    },
    hodController.getClassrooms
  );

  fastify.get<{ Params: { id: string } }>(
    "/classrooms/:id",
    {
      preHandler: hodGuard,
      preValidation: [validateParams(classroomIdParamSchema)],
    },
    hodController.getClassroomById
  );

  fastify.post<{ Body: CreateClassroomInput }>(
    "/classrooms",
    {
      preHandler: hodGuard,
      preValidation: [validateBody(createClassroomSchema)],
    },
    hodController.createClassroom
  );

  fastify.patch<{ Params: { id: string }; Body: UpdateClassroomInput }>(
    "/classrooms/:id",
    {
      preHandler: hodGuard,
      preValidation: [
        validateParams(classroomIdParamSchema),
        validateBody(updateClassroomSchema),
      ],
    },
    hodController.updateClassroom
  );

  // ─── Advisors ───────────────────────────────────────────────────────────────
  fastify.get<{ Querystring: GetAdvisorsQuery }>(
    "/advisors",
    {
      preHandler: hodGuard,
      preValidation: [validateQuery(getAdvisorsQuerySchema)],
    },
    hodController.getAdvisors
  );

  fastify.get<{ Params: { id: string } }>(
    "/advisors/:id",
    {
      preHandler: hodGuard,
      preValidation: [validateParams(advisorIdParamSchema)],
    },
    hodController.getAdvisorById
  );

  fastify.post<{ Body: CreateAdvisorInput }>(
    "/advisors",
    {
      preHandler: hodGuard,
      preValidation: [validateBody(createAdvisorSchema)],
    },
    hodController.createAdvisor
  );

  fastify.patch<{ Params: { id: string }; Body: UpdateAdvisorInput }>(
    "/advisors/:id",
    {
      preHandler: hodGuard,
      preValidation: [
        validateParams(advisorIdParamSchema),
        validateBody(updateAdvisorSchema),
      ],
    },
    hodController.updateAdvisor
  );

  fastify.post<{
    Params: { advisorId: string };
    Body: AssignAdvisorClassroomInput;
  }>(
    "/advisors/:advisorId/assign-classroom",
    {
      preHandler: hodGuard,
      preValidation: [
        validateParams(assignAdvisorParamSchema),
        validateBody(assignAdvisorClassroomSchema),
      ],
    },
    hodController.assignAdvisorClassroom
  );

  // ─── Department Scoped Audit Logs ───────────────────────────────────────────
  fastify.get<{ Querystring: GetHodAuditLogsQuery }>(
    "/audit-logs",
    {
      preHandler: hodGuard,
      preValidation: [validateQuery(getHodAuditLogsQuerySchema)],
    },
    hodController.getAuditLogs
  );

  // ─── Approvals & Fees Foundations (Phase 7) ─────────────────────────────────
  fastify.get("/approvals/summary", { preHandler: hodGuard }, hodController.getApprovalsSummary);
  fastify.get("/fees/summary", { preHandler: hodGuard }, hodController.getFeesSummary);

  // ─── Approvals (Phase 7: HOD stage) ───────────────────────────────────────
  fastify.get<{ Querystring: GetHodApprovalsQuery }>(
    "/approvals",
    {
      preHandler: hodGuard,
      preValidation: [validateQuery(getHodApprovalsQuerySchema)],
    },
    hodController.getApprovals
  );

  fastify.post<{ Body: DecideHodApprovalInput }>(
    "/approvals",
    {
      preHandler: hodGuard,
      // Approval spam protection on the state-changing decision endpoint.
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      preValidation: [validateBody(decideHodApprovalSchema)],
    },
    hodController.decideApproval
  );

  // ─── Fees (department scope; approval flags owned by the engine) ──────────
  fastify.get<{ Querystring: GetHodFeesQuery }>(
    "/fees",
    {
      preHandler: hodGuard,
      preValidation: [validateQuery(getHodFeesQuerySchema)],
    },
    hodController.getFeeVerifications
  );

  // Student fee verification (OR rule, atomic, idempotent)
  fastify.post<{ Body: ApproveFeeVerificationInput }>(
    "/fees/approve",
    {
      preHandler: hodGuard,
      preValidation: [validateBody(approveFeeVerificationSchema)],
    },
    hodController.approveFeeVerification
  );

  // ─── Exportable Reports ───────────────────────────────────────────────────
  fastify.get(
    "/reports/defaulters/export",
    { preHandler: hodGuard },
    hodController.exportDefaulters
  );

  fastify.get(
    "/reports/clearance/export",
    { preHandler: hodGuard },
    hodController.exportClearanceSummary
  );
};
