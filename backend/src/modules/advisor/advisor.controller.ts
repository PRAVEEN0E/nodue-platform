import { FastifyReply, FastifyRequest } from "fastify";
import { advisorService } from "./advisor.service";
import {
  GetAdvisorApprovalsQuery,
  DecideAdvisorApprovalInput,
  ApproveFeeVerificationInput,
  GetFeeVerificationsQuery,
  GetFinalVerificationQuery,
} from "./advisor.schema";
import {
  CreateStudentInput,
  UpdateStudentInput,
  GetStudentsQuery,
  GetStaffQuery,
  GetAvailableStaffQuery,
  CreateSubjectInput,
  UpdateSubjectInput,
  GetSubjectsQuery,
  MapStaffToSubjectInput,
} from "./advisor.schema";
import { SUBJECT_CSV_TEMPLATE, ADVISOR_STUDENT_CSV_TEMPLATE } from "../../utils/csvParser";

function requestMeta(request: FastifyRequest) {
  return {
    userId: request.user.userId,
    ip: request.ip,
    userAgent: request.headers["user-agent"],
  };
}

export const advisorController = {
  async getDashboard(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = requestMeta(request);
    const data = await advisorService.getDashboard(userId);
    return reply.send({ success: true, data });
  },

  // ─── Students ─────────────────────────────────────────────────────────────

  async getStudents(
    request: FastifyRequest<{ Querystring: GetStudentsQuery }>,
    reply: FastifyReply
  ) {
    const { userId } = requestMeta(request);
    const result = await advisorService.getStudents(userId, request.query);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  },

  async getStudentById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = requestMeta(request);
    const student = await advisorService.getStudentById(userId, request.params.id);
    return reply.send({ success: true, data: student });
  },

  async createStudent(
    request: FastifyRequest<{ Body: CreateStudentInput }>,
    reply: FastifyReply
  ) {
    const { userId, ip, userAgent } = requestMeta(request);
    const student = await advisorService.createStudent(userId, request.body, ip, userAgent);
    return reply.status(201).send({ success: true, data: student });
  },

  async updateStudent(
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateStudentInput }>,
    reply: FastifyReply
  ) {
    const { userId, ip, userAgent } = requestMeta(request);
    const student = await advisorService.updateStudent(userId, request.params.id, request.body, ip, userAgent);
    return reply.send({ success: true, data: student });
  },

  // ─── Staff (assignment/discovery only; accounts are ADMIN-owned) ────────

  async getStaff(request: FastifyRequest<{ Querystring: GetStaffQuery }>, reply: FastifyReply) {
    const { userId } = requestMeta(request);
    const result = await advisorService.getStaff(userId, request.query);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  },

  async getAvailableStaff(
    request: FastifyRequest<{ Querystring: GetAvailableStaffQuery }>,
    reply: FastifyReply
  ) {
    const { userId } = requestMeta(request);
    const result = await advisorService.getAvailableStaff(userId, request.query);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  },

  async getStaffById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = requestMeta(request);
    const staff = await advisorService.getStaffById(userId, request.params.id);
    return reply.send({ success: true, data: staff });
  },

  // Explicit 403 denials: advisor may never create or edit staff accounts.
  async createStaffDenied(_request: FastifyRequest, _reply: FastifyReply) {
    await advisorService.staffCreateDenied();
  },

  async updateStaffDenied(_request: FastifyRequest, _reply: FastifyReply) {
    await advisorService.staffUpdateDenied();
  },

  // ─── Subjects ─────────────────────────────────────────────────────────────

  async getSubjects(
    request: FastifyRequest<{ Querystring: GetSubjectsQuery }>,
    reply: FastifyReply
  ) {
    const { userId } = requestMeta(request);
    const result = await advisorService.getSubjects(userId, request.query);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  },

  async getSubjectById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = requestMeta(request);
    const subject = await advisorService.getSubjectById(userId, request.params.id);
    return reply.send({ success: true, data: subject });
  },

  async createSubject(
    request: FastifyRequest<{ Body: CreateSubjectInput }>,
    reply: FastifyReply
  ) {
    const { userId, ip, userAgent } = requestMeta(request);
    const subject = await advisorService.createSubject(userId, request.body, ip, userAgent);
    return reply.status(201).send({ success: true, data: subject });
  },

  async updateSubject(
    request: FastifyRequest<{ Params: { id: string }; Body: UpdateSubjectInput }>,
    reply: FastifyReply
  ) {
    const { userId, ip, userAgent } = requestMeta(request);
    const subject = await advisorService.updateSubject(userId, request.params.id, request.body, ip, userAgent);
    return reply.send({ success: true, data: subject });
  },

  // ─── Subject ↔ Staff mapping ──────────────────────────────────────────────

  async getSubjectStaff(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const { userId } = requestMeta(request);
    const staff = await advisorService.getSubjectStaff(userId, request.params.id);
    return reply.send({ success: true, data: staff });
  },

  async mapStaffToSubject(
    request: FastifyRequest<{ Params: { id: string }; Body: MapStaffToSubjectInput }>,
    reply: FastifyReply
  ) {
    const { userId, ip, userAgent } = requestMeta(request);
    const mapping = await advisorService.mapStaffToSubject(
      userId,
      request.params.id,
      request.body.staffId,
      ip,
      userAgent
    );
    return reply.status(201).send({ success: true, data: mapping });
  },

  async unmapStaffFromSubject(
    request: FastifyRequest<{ Params: { id: string; staffId: string } }>,
    reply: FastifyReply
  ) {
    const { userId, ip, userAgent } = requestMeta(request);
    const result = await advisorService.unmapStaffFromSubject(
      userId,
      request.params.id,
      request.params.staffId,
      ip,
      userAgent
    );
    return reply.send({ success: true, data: result });
  },

  // ─── Fee Verifications ───────────────────────────────────────────────────

  async getFeeVerifications(
    request: FastifyRequest<{ Querystring: GetFeeVerificationsQuery }>,
    reply: FastifyReply
  ) {
    const { userId } = requestMeta(request);
    const result = await advisorService.getFeeVerifications(userId, request.query);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  },

  // ─── Approvals (Phase 7: advisor stage) ───────────────────────────────────

  async getApprovals(
    request: FastifyRequest<{ Querystring: GetAdvisorApprovalsQuery }>,
    reply: FastifyReply
  ) {
    const { userId } = requestMeta(request);
    const result = await advisorService.getApprovals(userId, request.query);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  },

  async decideApproval(
    request: FastifyRequest<{ Body: DecideAdvisorApprovalInput }>,
    reply: FastifyReply
  ) {
    const { userId, ip, userAgent } = requestMeta(request);
    const result = await advisorService.decideApproval(userId, request.body, ip, userAgent);
    return reply.status(result.idempotent ? 200 : 201).send({ success: true, data: result });
  },

  // ─── Final Verification (Phase 7 derived NoDue completion) ────────────────

  async getFinalVerifications(
    request: FastifyRequest<{ Querystring: GetFinalVerificationQuery }>,
    reply: FastifyReply
  ) {
    const { userId } = requestMeta(request);
    const result = await advisorService.getFinalVerifications(userId, request.query);
    return reply.send({ success: true, data: result.data, meta: result.meta });
  },

  async approveFeeVerification(
    request: FastifyRequest<{ Body: ApproveFeeVerificationInput }>,
    reply: FastifyReply
  ) {
    const { userId, ip, userAgent } = requestMeta(request);
    const result = await advisorService.approveFeeVerification(userId, request.body, ip, userAgent);
    return reply.send({ success: true, data: result });
  },

  // ─── Bulk Import & Reports ────────────────────────────────────────────────

  async bulkImportSubjects(request: FastifyRequest, reply: FastifyReply) {
    const { userId, ip, userAgent } = requestMeta(request);
    const dryRun = (request.query as Record<string, string>)["dryRun"] !== "false";

    const data = await (request as FastifyRequest & { file?: () => Promise<{ toBuffer: () => Promise<Buffer> }> }).file?.();
    if (!data) {
      return reply.status(400).send({ success: false, error: { code: "NO_FILE", message: "No CSV file uploaded." } });
    }
    const buffer = await data.toBuffer();
    const csvText = buffer.toString("utf-8");

    const result = await advisorService.bulkImportSubjects(csvText, userId, dryRun, ip, userAgent);
    return reply.send({ success: true, data: result });
  },

  async downloadSubjectTemplate(_request: FastifyRequest, reply: FastifyReply) {
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="subjects-import-template.csv"');
    return reply.send(SUBJECT_CSV_TEMPLATE);
  },

  async exportDefaulters(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = requestMeta(request);
    const csv = await advisorService.exportDefaultersCsv(userId);
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="advisor-defaulters.csv"');
    return reply.send(csv);
  },

  async exportClearanceSummary(request: FastifyRequest, reply: FastifyReply) {
    const { userId } = requestMeta(request);
    const csv = await advisorService.exportClearanceSummaryCsv(userId);
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="advisor-clearance-summary.csv"');
    return reply.send(csv);
  },

  // ─── Bulk Student Import (Classroom scope) ────────────────────────────────

  async bulkImportStudents(request: FastifyRequest, reply: FastifyReply) {
    const { userId, ip, userAgent } = requestMeta(request);
    const dryRun = (request.query as Record<string, string>)["dryRun"] !== "false";

    const data = await (request as FastifyRequest & { file?: () => Promise<{ toBuffer: () => Promise<Buffer> }> }).file?.();
    if (!data) {
      return reply.status(400).send({ success: false, error: { code: "NO_FILE", message: "No CSV file uploaded." } });
    }
    const buffer = await data.toBuffer();
    const csvText = buffer.toString("utf-8");

    const result = await advisorService.bulkImportStudents(csvText, userId, dryRun, ip, userAgent);
    return reply.send({ success: true, data: result });
  },

  async downloadStudentTemplate(_request: FastifyRequest, reply: FastifyReply) {
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="students-import-template.csv"');
    return reply.send(ADVISOR_STUDENT_CSV_TEMPLATE);
  },
};
