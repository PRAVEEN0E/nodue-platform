import { FastifyPluginAsync } from "fastify";
import { Role } from "@prisma/client";
import { adminController } from "./admin.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateBody, validateQuery, validateParams } from "../../utils/validate";
import {
  createHodSchema,
  updateHodStatusSchema,
  getUsersQuerySchema,
  getHodsQuerySchema,
  getAuditLogsQuerySchema,
  createStaffSchema,
  updateStaffSchema,
  getStaffQuerySchema,
  hodIdParamSchema,
  staffIdParamSchema,
  updateUserSchema,
  userIdParamSchema,
  departmentIdParamSchema,
  assignHodSchema,
  CreateHodInput,
  UpdateHodStatusInput,
  GetUsersQuery,
  GetHodsQuery,
  GetAuditLogsQuery,
  CreateStaffInput,
  UpdateStaffInput,
  GetStaffQuery,
  UpdateUserInput,
  AssignHodInput,
} from "./admin.schema";

// All admin routes require both authentication and ADMIN role authorization
const adminGuard = [authenticate, authorize(Role.ADMIN)];

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/admin/dashboard
  fastify.get("/dashboard", { preHandler: adminGuard }, adminController.getDashboard);

  // GET /api/v1/admin/departments
  fastify.get("/departments", { preHandler: adminGuard }, adminController.getDepartments);

  // GET /api/v1/admin/hods
  fastify.get<{ Querystring: GetHodsQuery }>(
    "/hods",
    {
      preHandler: adminGuard,
      preValidation: [validateQuery(getHodsQuerySchema)],
    },
    adminController.getHods
  );

  // POST /api/v1/admin/hods
  fastify.post<{ Body: CreateHodInput }>(
    "/hods",
    {
      preHandler: adminGuard,
      preValidation: [validateBody(createHodSchema)],
    },
    adminController.createHod
  );

  // PATCH /api/v1/admin/hods/:id/status
  fastify.patch<{ Params: { id: string }; Body: UpdateHodStatusInput }>(
    "/hods/:id/status",
    {
      preHandler: adminGuard,
      preValidation: [
        validateParams(hodIdParamSchema),
        validateBody(updateHodStatusSchema),
      ],
    },
    adminController.updateHodStatus
  );

  // GET /api/v1/admin/users
  fastify.get<{ Querystring: GetUsersQuery }>(
    "/users",
    {
      preHandler: adminGuard,
      preValidation: [validateQuery(getUsersQuerySchema)],
    },
    adminController.getUsers
  );

  // PATCH /api/v1/admin/users/:id
  fastify.patch<{ Params: { id: string }; Body: UpdateUserInput }>(
    "/users/:id",
    {
      preHandler: adminGuard,
      preValidation: [
        validateParams(userIdParamSchema),
        validateBody(updateUserSchema),
      ],
    },
    adminController.updateUser
  );

  // DELETE /api/v1/admin/users/:id
  fastify.delete<{ Params: { id: string } }>(
    "/users/:id",
    {
      preHandler: adminGuard,
      preValidation: [validateParams(userIdParamSchema)],
    },
    adminController.deleteUser
  );

  // POST /api/v1/admin/departments/:id/assign-hod
  fastify.post<{ Params: { id: string }; Body: AssignHodInput }>(
    "/departments/:id/assign-hod",
    {
      preHandler: adminGuard,
      preValidation: [
        validateParams(departmentIdParamSchema),
        validateBody(assignHodSchema),
      ],
    },
    adminController.assignHodToDepartment
  );

  // ─── Staff Management (ADMIN-only lifecycle) ──────────────────────────────
  // Staff account CRUD belongs exclusively to ADMIN. Advisors may only assign
  // existing staff via subject-staff mapping (advisor module); any direct
  // advisor call to create/patch staff is rejected 403 server-side.

  // GET /api/v1/admin/staff
  fastify.get<{ Querystring: GetStaffQuery }>(
    "/staff",
    {
      preHandler: adminGuard,
      preValidation: [validateQuery(getStaffQuerySchema)],
    },
    adminController.getStaff
  );

  // POST /api/v1/admin/staff
  fastify.post<{ Body: CreateStaffInput }>(
    "/staff",
    {
      preHandler: adminGuard,
      preValidation: [validateBody(createStaffSchema)],
    },
    adminController.createStaff
  );

  // PATCH /api/v1/admin/staff/:id
  fastify.patch<{ Params: { id: string }; Body: UpdateStaffInput }>(
    "/staff/:id",
    {
      preHandler: adminGuard,
      preValidation: [
        validateParams(staffIdParamSchema),
        validateBody(updateStaffSchema),
      ],
    },
    adminController.updateStaff
  );

  // DELETE /api/v1/admin/staff/:id
  fastify.delete<{ Params: { id: string } }>(
    "/staff/:id",
    {
      preHandler: adminGuard,
      preValidation: [validateParams(staffIdParamSchema)],
    },
    adminController.deleteStaff
  );

  // GET /api/v1/admin/audit-logs
  fastify.get<{ Querystring: GetAuditLogsQuery }>(
    "/audit-logs",
    {
      preHandler: adminGuard,
      preValidation: [validateQuery(getAuditLogsQuerySchema)],
    },
    adminController.getAuditLogs
  );

  // ─── Bulk Import Routes ───────────────────────────────────────────────────
  // POST /api/v1/admin/students/bulk-import?dryRun=true|false
  fastify.post(
    "/students/bulk-import",
    { preHandler: adminGuard },
    adminController.bulkImportStudents
  );

  // GET /api/v1/admin/students/template
  fastify.get(
    "/students/template",
    { preHandler: adminGuard },
    adminController.downloadStudentTemplate
  );

  // POST /api/v1/admin/staff/bulk-import?dryRun=true|false
  fastify.post(
    "/staff/bulk-import",
    { preHandler: adminGuard },
    adminController.bulkImportStaff
  );

  // GET /api/v1/admin/staff/template
  fastify.get(
    "/staff/template",
    { preHandler: adminGuard },
    adminController.downloadStaffTemplate
  );
};
