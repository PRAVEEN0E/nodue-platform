import { FastifyReply, FastifyRequest } from "fastify";
import { adminService } from "./admin.service";
import {
  CreateHodInput,
  GetUsersQuery,
  GetHodsQuery,
  GetAuditLogsQuery,
  UpdateHodStatusInput,
  CreateStaffInput,
  UpdateStaffInput,
  GetStaffQuery,
} from "./admin.schema";

function requestMeta(request: FastifyRequest) {
  return {
    userId: request.user.userId,
    ip: request.ip,
    userAgent: request.headers["user-agent"],
  };
}

export const adminController = {
  async getDashboard(request: FastifyRequest, reply: FastifyReply) {
    const stats = await adminService.getDashboardStats();
    return reply.send({ success: true, data: stats });
  },

  async getDepartments(request: FastifyRequest, reply: FastifyReply) {
    const departments = await adminService.getDepartments();
    return reply.send({ success: true, data: departments });
  },

  async getHods(
    request: FastifyRequest<{ Querystring: GetHodsQuery }>,
    reply: FastifyReply
  ) {
    const hods = await adminService.getHods(request.query);
    return reply.send({ success: true, data: hods });
  },

  async createHod(
    request: FastifyRequest<{ Body: CreateHodInput }>,
    reply: FastifyReply
  ) {
    const newHod = await adminService.createHod(
      request.body,
      request.user.userId,
      request.ip,
      request.headers["user-agent"]
    );
    return reply.status(201).send({ success: true, data: { user: newHod } });
  },

  async updateHodStatus(
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateHodStatusInput }>,
    reply: FastifyReply
  ) {
    const updatedUser = await adminService.updateHodStatus(
      request.params.id,
      request.body,
      request.user.userId,
      request.ip,
      request.headers["user-agent"]
    );
    return reply.send({ success: true, data: { user: updatedUser } });
  },

  async getUsers(
    request: FastifyRequest<{ Querystring: GetUsersQuery }>,
    reply: FastifyReply
  ) {
    const result = await adminService.getUsers(request.query);
    return reply.send({ success: true, ...result });
  },

  async getAuditLogs(
    request: FastifyRequest<{ Querystring: GetAuditLogsQuery }>,
    reply: FastifyReply
  ) {
    const result = await adminService.getAuditLogs(request.query);
    return reply.send({ success: true, ...result });
  },

  // ─── Staff Management (ADMIN-only lifecycle) ──────────────────────────────

  async getStaff(
    request: FastifyRequest<{ Querystring: GetStaffQuery }>,
    reply: FastifyReply
  ) {
    const result = await adminService.getStaff(request.query);
    return reply.send({ success: true, ...result });
  },

  async createStaff(
    request: FastifyRequest<{ Body: CreateStaffInput }>,
    reply: FastifyReply
  ) {
    const { userId, ip, userAgent } = requestMeta(request);
    const staff = await adminService.createStaff(request.body, userId, ip, userAgent);
    return reply.status(201).send({ success: true, data: staff });
  },

  async updateStaff(
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateStaffInput }>,
    reply: FastifyReply
  ) {
    const { userId, ip, userAgent } = requestMeta(request);
    const staff = await adminService.updateStaff(
      request.params.id,
      request.body,
      userId,
      ip,
      userAgent
    );
    return reply.send({ success: true, data: staff });
  },

  async deleteStaff(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const { userId, ip, userAgent } = requestMeta(request);
    const result = await adminService.deleteStaff(
      request.params.id,
      userId,
      ip,
      userAgent
    );
    return reply.send({ success: true, data: result });
  },
};
