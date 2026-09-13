import { FastifyReply, FastifyRequest } from "fastify";
import { studentService } from "./student.service";
import { GetStudentSubjectsQuery } from "./student.schema";

export const studentController = {
  async getDashboard(request: FastifyRequest, reply: FastifyReply) {
    const data = await studentService.getDashboard(request.user.userId);
    return reply.send({ success: true, data });
  },

  async getProfile(request: FastifyRequest, reply: FastifyReply) {
    const profile = await studentService.getProfile(request.user.userId);
    return reply.send({ success: true, data: profile });
  },

  async getSubjects(
    request: FastifyRequest<{ Querystring: GetStudentSubjectsQuery }>,
    reply: FastifyReply
  ) {
    const result = await studentService.getSubjects(request.user.userId, request.query);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  },

  async getSubjectById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const subject = await studentService.getSubjectById(request.user.userId, request.params.id);
    return reply.send({ success: true, data: subject });
  },

  async getStatus(request: FastifyRequest, reply: FastifyReply) {
    const status = await studentService.getStatus(request.user.userId);
    return reply.send({ success: true, data: status });
  },
};
