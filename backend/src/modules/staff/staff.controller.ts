import { FastifyReply, FastifyRequest } from "fastify";
import { staffService } from "./staff.service";
import {
  GetStaffSubjectsQuery,
  GetStaffStudentsQuery,
  GetStaffApprovalsQuery,
  DecideApprovalInput,
} from "./staff.schema";

function requestMeta(request: FastifyRequest) {
  return {
    userId: request.user.userId,
    ip: request.ip,
    userAgent: request.headers["user-agent"],
  };
}

export const staffController = {
  async getDashboard(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = requestMeta(request);
    const data = await staffService.getDashboard(userId);
    return reply.send({ success: true, data });
  },

  async getClasses(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = requestMeta(request);
    const result = await staffService.getClasses(userId);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  },

  async getClassroomById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = requestMeta(request);
    const classroom = await staffService.getClassroomById(userId, request.params.id);
    return reply.send({ success: true, data: classroom });
  },

  async getSubjects(
    request: FastifyRequest<{ Querystring: GetStaffSubjectsQuery }>,
    reply: FastifyReply
  ) {
    const { userId } = requestMeta(request);
    const result = await staffService.getSubjects(userId, request.query);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  },

  async getSubjectById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = requestMeta(request);
    const subject = await staffService.getSubjectById(userId, request.params.id);
    return reply.send({ success: true, data: subject });
  },

  async getStudents(
    request: FastifyRequest<{ Querystring: GetStaffStudentsQuery }>,
    reply: FastifyReply
  ) {
    const { userId } = requestMeta(request);
    const result = await staffService.getStudents(userId, request.query);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  },

  async getStudentById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = requestMeta(request);
    const student = await staffService.getStudentById(userId, request.params.id);
    return reply.send({ success: true, data: student });
  },

  async getApprovals(
    request: FastifyRequest<{ Querystring: GetStaffApprovalsQuery }>,
    reply: FastifyReply
  ) {
    const { userId } = requestMeta(request);
    const result = await staffService.getApprovals(userId, request.query);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  },

  async decideApproval(
    request: FastifyRequest<{ Body: DecideApprovalInput }>,
    reply: FastifyReply
  ) {
    const { userId, ip, userAgent } = requestMeta(request);
    const result = await staffService.decideApproval(userId, request.body, ip, userAgent);
    const statusCode = result.idempotent ? 200 : 201;
    return reply.status(statusCode).send({ success: true, data: result });
  },
};
