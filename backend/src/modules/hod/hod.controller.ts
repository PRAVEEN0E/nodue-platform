import { FastifyReply, FastifyRequest } from "fastify";
import { hodService } from "./hod.service";
import {
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

export const hodController = {
  async getDashboard(request: FastifyRequest, reply: FastifyReply) {
    const data = await hodService.getDashboard(request.departmentId!);
    return reply.status(200).send({ success: true, data });
  },

  async getDepartment(request: FastifyRequest, reply: FastifyReply) {
    const data = await hodService.getDepartment(request.departmentId!);
    return reply.status(200).send({ success: true, data });
  },

  async updateDepartment(
    request: FastifyRequest<{ Body: UpdateDepartmentInput }>,
    reply: FastifyReply
  ) {
    const data = await hodService.updateDepartment(
      request.departmentId!,
      request.body,
      request.user!.userId,
      request.ip
    );
    return reply.status(200).send({ success: true, data });
  },

  // ─── Classrooms ─────────────────────────────────────────────────────────────

  async getClassrooms(
    request: FastifyRequest<{ Querystring: GetClassroomsQuery }>,
    reply: FastifyReply
  ) {
    const result = await hodService.getClassrooms(request.departmentId!, request.query);
    return reply.status(200).send({
      success: true,
      data: result.data,
      meta: result.meta,
    });
  },

  async getClassroomById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const data = await hodService.getClassroomById(request.params.id, request.departmentId!);
    return reply.status(200).send({ success: true, data });
  },

  async createClassroom(
    request: FastifyRequest<{ Body: CreateClassroomInput }>,
    reply: FastifyReply
  ) {
    const data = await hodService.createClassroom(
      request.departmentId!,
      request.body,
      request.user!.userId,
      request.ip
    );
    return reply.status(201).send({ success: true, data });
  },

  async updateClassroom(
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateClassroomInput }>,
    reply: FastifyReply
  ) {
    const data = await hodService.updateClassroom(
      request.params.id,
      request.departmentId!,
      request.body,
      request.user!.userId,
      request.ip
    );
    return reply.status(200).send({ success: true, data });
  },

  // ─── Advisors ───────────────────────────────────────────────────────────────

  async getAdvisors(
    request: FastifyRequest<{ Querystring: GetAdvisorsQuery }>,
    reply: FastifyReply
  ) {
    const result = await hodService.getAdvisors(request.departmentId!, request.query);
    return reply.status(200).send({
      success: true,
      data: result.data,
      meta: result.meta,
    });
  },

  async getAdvisorById(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const data = await hodService.getAdvisorById(request.params.id, request.departmentId!);
    return reply.status(200).send({ success: true, data });
  },

  async createAdvisor(
    request: FastifyRequest<{ Body: CreateAdvisorInput }>,
    reply: FastifyReply
  ) {
    const data = await hodService.createAdvisor(
      request.departmentId!,
      request.body,
      request.user!.userId,
      request.ip
    );
    return reply.status(201).send({ success: true, data });
  },

  async updateAdvisor(
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateAdvisorInput }>,
    reply: FastifyReply
  ) {
    const data = await hodService.updateAdvisor(
      request.params.id,
      request.departmentId!,
      request.body,
      request.user!.userId,
      request.ip
    );
    return reply.status(200).send({ success: true, data });
  },

  async assignAdvisorClassroom(
    request: FastifyRequest<{
      Params: { advisorId: string };
      Body: AssignAdvisorClassroomInput;
    }>,
    reply: FastifyReply
  ) {
    const data = await hodService.assignAdvisorClassroom(
      request.params.advisorId,
      request.body.classroomId,
      request.departmentId!,
      request.user!.userId,
      request.ip
    );
    return reply.status(200).send({ success: true, data });
  },

  // ─── Audit Logs ─────────────────────────────────────────────────────────────

  async getAuditLogs(
    request: FastifyRequest<{ Querystring: GetHodAuditLogsQuery }>,
    reply: FastifyReply
  ) {
    const result = await hodService.getAuditLogs(request.departmentId!, request.query);
    return reply.status(200).send({
      success: true,
      data: result.data,
      meta: result.meta,
    });
  },

  // ─── Approvals & Fees Foundations ───────────────────────────────────────────

  async getApprovalsSummary(request: FastifyRequest, reply: FastifyReply) {
    const data = await hodService.getApprovalsSummary(request.departmentId!);
    return reply.status(200).send({ success: true, data });
  },

  async getFeesSummary(request: FastifyRequest, reply: FastifyReply) {
    const data = await hodService.getFeesSummary(request.departmentId!);
    return reply.status(200).send({ success: true, data });
  },

  // ─── Approvals (Phase 7: HOD stage) ───────────────────────────────────────

  async getApprovals(
    request: FastifyRequest<{ Querystring: GetHodApprovalsQuery }>,
    reply: FastifyReply
  ) {
    const result = await hodService.getApprovals(request.departmentId!, request.query);
    return reply.status(200).send({ success: true, data: result.data, meta: result.meta });
  },

  async decideApproval(
    request: FastifyRequest<{ Body: DecideHodApprovalInput }>,
    reply: FastifyReply
  ) {
    const result = await hodService.decideApproval(
      request.departmentId!,
      request.user!.userId,
      request.body,
      request.ip,
      request.headers["user-agent"]
    );
    return reply.status(result.idempotent ? 200 : 201).send({ success: true, data: result });
  },

  async getFeeVerifications(
    request: FastifyRequest<{ Querystring: GetHodFeesQuery }>,
    reply: FastifyReply
  ) {
    const result = await hodService.getFeeVerifications(request.departmentId!, request.query);
    return reply.status(200).send({ success: true, data: result.data, meta: result.meta });
  },

  async approveFeeVerification(
    request: FastifyRequest<{ Body: ApproveFeeVerificationInput }>,
    reply: FastifyReply
  ) {
    const result = await hodService.approveFeeVerification(
      request.departmentId!,
      request.user!.userId,
      request.body,
      request.ip,
      request.headers["user-agent"]
    );
    return reply.status(200).send({ success: true, data: result });
  },
};
