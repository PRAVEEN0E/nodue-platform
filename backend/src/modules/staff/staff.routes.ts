import { FastifyPluginAsync } from "fastify";
import { Role } from "@prisma/client";
import { staffController } from "./staff.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateBody, validateQuery, validateParams } from "../../utils/validate";
import {
  getStaffSubjectsQuerySchema,
  subjectIdParamSchema,
  classroomIdParamSchema,
  getStaffStudentsQuerySchema,
  studentIdParamSchema,
  getStaffApprovalsQuerySchema,
  decideApprovalSchema,
  GetStaffSubjectsQuery,
  GetStaffStudentsQuery,
  GetStaffApprovalsQuery,
  DecideApprovalInput,
} from "./staff.schema";

// All staff routes require authentication + STAFF role. Assignment-level
// authorization is enforced per resource inside the service layer.
const staffGuard = [authenticate, authorize(Role.STAFF)];

export const staffRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── Dashboard ────────────────────────────────────────────────────────────
  fastify.get("/dashboard", { preHandler: staffGuard }, staffController.getDashboard);

  // ─── My Classes (assigned classrooms, derived from subject mappings) ──────
  fastify.get("/classes", { preHandler: staffGuard }, staffController.getClasses);

  fastify.get<{ Params: { id: string } }>(
    "/classes/:id",
    {
      preHandler: staffGuard,
      preValidation: [validateParams(classroomIdParamSchema)],
    },
    staffController.getClassroomById
  );

  // ─── Assigned subjects (read-only) ────────────────────────────────────────
  fastify.get<{ Querystring: GetStaffSubjectsQuery }>(
    "/subjects",
    {
      preHandler: staffGuard,
      preValidation: [validateQuery(getStaffSubjectsQuerySchema)],
    },
    staffController.getSubjects
  );

  fastify.get<{ Params: { id: string } }>(
    "/subjects/:id",
    {
      preHandler: staffGuard,
      preValidation: [validateParams(subjectIdParamSchema)],
    },
    staffController.getSubjectById
  );

  // ─── Students in scope (read-only) ────────────────────────────────────────
  fastify.get<{ Querystring: GetStaffStudentsQuery }>(
    "/students",
    {
      preHandler: staffGuard,
      preValidation: [validateQuery(getStaffStudentsQuerySchema)],
    },
    staffController.getStudents
  );

  fastify.get<{ Params: { id: string } }>(
    "/students/:id",
    {
      preHandler: staffGuard,
      preValidation: [validateParams(studentIdParamSchema)],
    },
    staffController.getStudentById
  );

  // ─── Subject-level approvals ──────────────────────────────────────────────
  fastify.get<{ Querystring: GetStaffApprovalsQuery }>(
    "/approvals",
    {
      preHandler: staffGuard,
      preValidation: [validateQuery(getStaffApprovalsQuerySchema)],
    },
    staffController.getApprovals
  );

  fastify.post<{ Body: DecideApprovalInput }>(
    "/approvals",
    {
      preHandler: staffGuard,
      // Approval spam protection on the state-changing decision endpoint.
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      preValidation: [validateBody(decideApprovalSchema)],
    },
    staffController.decideApproval
  );
};
