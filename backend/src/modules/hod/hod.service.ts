import { hodRepository } from "./hod.repository";
import { prisma } from "../../plugins/database";
import { cacheService } from "../../plugins/redis";
import { hashPassword } from "../../utils/password";
import { auditService } from "../../utils/auditService";
import { ConflictError, ForbiddenError, NotFoundError } from "../../utils/errors";
import {
  CreateClassroomInput,
  UpdateClassroomInput,
  GetClassroomsQuery,
  CreateAdvisorInput,
  UpdateAdvisorInput,
  GetAdvisorsQuery,
  UpdateDepartmentInput,
  GetHodAuditLogsQuery,
  GetHodApprovalsQuery,
  DecideHodApprovalInput,
  GetHodFeesQuery,
  ApproveFeeVerificationInput,
} from "./hod.schema";
import { approvalEngine } from "../approval-engine/approval-engine.service";
import { Role } from "@prisma/client";

export const hodService = {
  // ─── Dashboard & Department ─────────────────────────────────────────────────

  async getDashboard(departmentId: string) {
    const cacheKey = `hod:dashboard:${departmentId}`;
    const cached = await cacheService.get<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const department = await hodRepository.getDepartmentDetails(departmentId);
    if (!department) {
      throw new NotFoundError("Department not found");
    }

    const recentLogs = await hodRepository.getPaginatedAuditLogs(departmentId, {
      page: 1,
      limit: 10,
    });

    const result = {
      department,
      recentActivity: recentLogs.data,
    };

    // Cache for 60 seconds
    await cacheService.set(cacheKey, result, 60);
    return result;
  },

  async getDepartment(departmentId: string) {
    const department = await hodRepository.getDepartmentDetails(departmentId);
    if (!department) {
      throw new NotFoundError("Department not found");
    }
    return department;
  },

  async updateDepartment(
    departmentId: string,
    input: UpdateDepartmentInput,
    actorUserId: string,
    ipAddress?: string
  ) {
    const updated = await hodRepository.updateDepartment(departmentId, input.name);

    await cacheService.del(`hod:dashboard:${departmentId}`);
    await cacheService.del("departments:list");

    await auditService.log({
      actorUserId,
      departmentId,
      action: "DEPARTMENT_UPDATED",
      entityType: "Department",
      entityId: departmentId,
      metadata: { name: input.name },
      ipAddress,
    });

    return updated;
  },

  // ─── Classroom Service Methods ──────────────────────────────────────────────

  async getClassrooms(departmentId: string, query: GetClassroomsQuery) {
    return hodRepository.getPaginatedClassrooms(departmentId, query);
  },

  async getClassroomById(id: string, departmentId: string) {
    // 1. Check if classroom exists in the database
    const classroomAny = await prisma.classroom.findUnique({
      where: { id },
      select: { id: true, departmentId: true },
    });

    if (!classroomAny) {
      throw new NotFoundError("Classroom not found");
    }

    // 2. Strict department isolation: if belongs to another department, reject with 403 Forbidden
    if (classroomAny.departmentId !== departmentId) {
      throw new ForbiddenError("Access denied. Classroom does not belong to your department.");
    }

    return hodRepository.getClassroomById(id, departmentId);
  },

  async createClassroom(
    departmentId: string,
    data: CreateClassroomInput,
    actorUserId: string,
    ipAddress?: string
  ) {
    // Prevent duplicate classroom identity in same department
    const existing = await hodRepository.findClassroomByUniqueIdentity(
      departmentId,
      data.name,
      data.batch,
      data.semester,
      data.section
    );

    if (existing) {
      throw new ConflictError(
        "A classroom with this name or batch/semester/section already exists in your department."
      );
    }

    const classroom = await hodRepository.createClassroom(departmentId, data);

    await cacheService.del(`hod:dashboard:${departmentId}`);

    await auditService.log({
      actorUserId,
      departmentId,
      action: "CLASSROOM_CREATED",
      entityType: "Classroom",
      entityId: classroom.id,
      metadata: {
        name: classroom.name,
        batch: classroom.batch,
        semester: classroom.semester,
        section: classroom.section,
      },
      ipAddress,
    });

    return classroom;
  },

  async updateClassroom(
    id: string,
    departmentId: string,
    data: UpdateClassroomInput,
    actorUserId: string,
    ipAddress?: string
  ) {
    // 1. Verify existence and department scope
    const existing = await prisma.classroom.findUnique({
      where: { id },
      select: { id: true, departmentId: true, name: true, batch: true, semester: true, section: true },
    });

    if (!existing) {
      throw new NotFoundError("Classroom not found");
    }

    if (existing.departmentId !== departmentId) {
      throw new ForbiddenError("Access denied. Classroom does not belong to your department.");
    }

    // 2. If identity changed, ensure no collision with another classroom
    const targetName = data.name ?? existing.name;
    const targetBatch = data.batch ?? existing.batch;
    const targetSemester = data.semester ?? existing.semester;
    const targetSection = data.section ?? existing.section;

    const duplicate = await prisma.classroom.findFirst({
      where: {
        departmentId,
        id: { not: id },
        OR: [
          { name: targetName },
          { batch: targetBatch, semester: targetSemester, section: targetSection },
        ],
      },
    });

    if (duplicate) {
      throw new ConflictError(
        "Another classroom with this name or batch/semester/section already exists in your department."
      );
    }

    const updated = await hodRepository.updateClassroom(id, departmentId, data);

    await cacheService.del(`hod:dashboard:${departmentId}`);

    await auditService.log({
      actorUserId,
      departmentId,
      action: "CLASSROOM_UPDATED",
      entityType: "Classroom",
      entityId: updated.id,
      metadata: { changes: data },
      ipAddress,
    });

    return updated;
  },

  // ─── Advisor Service Methods ────────────────────────────────────────────────

  async getAdvisors(departmentId: string, query: GetAdvisorsQuery) {
    return hodRepository.getPaginatedAdvisors(departmentId, query);
  },

  async getAdvisorById(id: string, departmentId: string) {
    // 1. Check if user or advisor exists anywhere
    const userAny = await prisma.user.findFirst({
      where: {
        OR: [{ id }, { advisorProfile: { id } }],
      },
      select: { id: true, departmentId: true, role: true },
    });

    if (!userAny) {
      throw new NotFoundError("Advisor not found");
    }

    // 2. Strict department isolation
    if (userAny.departmentId !== departmentId || userAny.role !== "ADVISOR") {
      throw new ForbiddenError("Access denied. Advisor does not belong to your department.");
    }

    return hodRepository.getAdvisorById(id, departmentId);
  },

  async createAdvisor(
    departmentId: string,
    data: CreateAdvisorInput,
    actorUserId: string,
    ipAddress?: string
  ) {
    // 1. Check if email already taken
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictError("An account with this email address already exists.");
    }

    // 2. If classroomId provided, verify it belongs to this department
    if (data.classroomId) {
      const classroom = await prisma.classroom.findFirst({
        where: { id: data.classroomId },
        select: { id: true, departmentId: true },
      });

      if (!classroom) {
        throw new NotFoundError("Assigned classroom not found");
      }

      if (classroom.departmentId !== departmentId) {
        throw new ForbiddenError(
          "Access denied. Cannot assign advisor to a classroom from another department."
        );
      }
    }

    // 3. Hash password using Argon2id
    const passwordHash = await hashPassword(data.password);

    // 4. Create in atomic transaction
    const advisor = await hodRepository.createAdvisor(
      departmentId,
      {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        passwordHash,
      },
      data.classroomId
    );

    await cacheService.del(`hod:dashboard:${departmentId}`);

    await auditService.log({
      actorUserId,
      departmentId,
      action: "ADVISOR_CREATED",
      entityType: "User",
      entityId: advisor.userId,
      metadata: {
        email: advisor.email,
        firstName: advisor.firstName,
        lastName: advisor.lastName,
        classroomId: advisor.classroomId,
      },
      ipAddress,
    });

    return advisor;
  },

  async updateAdvisor(
    id: string,
    departmentId: string,
    data: UpdateAdvisorInput,
    actorUserId: string,
    ipAddress?: string
  ) {
    // 1. Verify existence & department scope
    const advisor = await hodRepository.getAdvisorById(id, departmentId);

    if (!advisor) {
      // Check if exists in another department
      const otherUser = await prisma.user.findFirst({
        where: { OR: [{ id }, { advisorProfile: { id } }] },
      });
      if (otherUser) {
        throw new ForbiddenError("Access denied. Advisor does not belong to your department.");
      }
      throw new NotFoundError("Advisor not found");
    }

    const updated = await hodRepository.updateAdvisorUser(advisor.userId, data);

    // If account was deactivated, invalidate session token and Redis cache
    if (data.isActive === false) {
      await cacheService.del(`user:active:${advisor.userId}`);
      await prisma.refreshToken.updateMany({
        where: { userId: advisor.userId },
        data: { revoked: true },
      });
    }

    await cacheService.del(`hod:dashboard:${departmentId}`);

    await auditService.log({
      actorUserId,
      departmentId,
      action: data.isActive !== undefined ? "USER_STATUS_UPDATED" : "ADVISOR_UPDATED",
      entityType: "User",
      entityId: advisor.userId,
      metadata: { changes: data },
      ipAddress,
    });

    return updated;
  },

  async assignAdvisorClassroom(
    advisorId: string,
    classroomId: string | null,
    departmentId: string,
    actorUserId: string,
    ipAddress?: string
  ) {
    // 1. Verify advisor exists and belongs to department
    const advisor = await prisma.advisor.findFirst({
      where: {
        OR: [{ id: advisorId }, { userId: advisorId }],
      },
      include: { user: { select: { id: true, departmentId: true, firstName: true, lastName: true } } },
    });

    if (!advisor) {
      throw new NotFoundError("Advisor not found");
    }

    if (advisor.user.departmentId !== departmentId) {
      throw new ForbiddenError("Access denied. Advisor does not belong to your department.");
    }

    // 2. If classroomId provided, verify it exists and belongs to department
    if (classroomId !== null) {
      const classroom = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: { id: true, departmentId: true, name: true },
      });

      if (!classroom) {
        throw new NotFoundError("Classroom not found");
      }

      if (classroom.departmentId !== departmentId) {
        throw new ForbiddenError("Access denied. Classroom belongs to another department.");
      }
    }

    // 3. Atomically assign in repository
    const result = await hodRepository.assignAdvisorToClassroom(advisor.id, classroomId, departmentId);

    await cacheService.del(`hod:dashboard:${departmentId}`);

    await auditService.log({
      actorUserId,
      departmentId,
      action: classroomId ? "ADVISOR_ASSIGNED" : "ADVISOR_UNASSIGNED",
      entityType: "Advisor",
      entityId: advisor.id,
      metadata: {
        advisorUserId: advisor.userId,
        classroomId,
      },
      ipAddress,
    });

    return result;
  },

  // ─── Audit Logs ─────────────────────────────────────────────────────────────

  async getAuditLogs(departmentId: string, query: GetHodAuditLogsQuery) {
    return hodRepository.getPaginatedAuditLogs(departmentId, query);
  },

  // ─── Approvals & Fees Foundations (Phase 7) ─────────────────────────────────

  async getApprovalsSummary(departmentId: string) {
    return hodRepository.getPendingApprovalsSummary(departmentId);
  },

  async getFeesSummary(departmentId: string) {
    return hodRepository.getFeeSummary(departmentId);
  },

  // ─── Approvals (Phase 7: HOD stage) ───────────────────────────────────────

  async getApprovals(departmentId: string, query: GetHodApprovalsQuery) {
    if (query.status !== "pending") {
      return hodRepository.getDecidedApprovals(departmentId, {
        page: query.page,
        limit: query.limit,
        search: query.search,
        status: query.status === "decided" ? undefined : query.status.toUpperCase() as "APPROVED" | "REJECTED",
      });
    }

    const candidates = await hodRepository.getApprovalQueueCandidates(departmentId, query.search);
    const pending = candidates.filter((s) => {
      const subjects = s.classroom.subjects;
      if (subjects.length === 0) return false;
      const allApproved = subjects.every((sub) =>
        sub.approvals.some((a) => a.studentId === s.id && a.status === "APPROVED")
      );
      if (!allApproved) return false;
      const advisor = s.approvals.find((a) => a.approverRole === Role.ADVISOR);
      if (!advisor || advisor.status !== "APPROVED") return false;
      return !s.approvals.some((a) => a.approverRole === Role.HOD);
    });

    const start = (query.page - 1) * query.limit;
    return {
      data: pending.slice(start, start + query.limit).map((s) => ({
        student: {
          id: s.id,
          registerNumber: s.registerNumber,
          classroom: { id: s.classroom.id, name: s.classroom.name },
          user: s.user,
        },
        subjects: s.classroom.subjects.map((sub) => ({ id: sub.id, code: sub.code, name: sub.name })),
        advisorDecision: s.approvals.find((a) => a.approverRole === Role.ADVISOR)?.status ?? "APPROVED",
        status: "PENDING" as const,
      })),
      meta: {
        total: pending.length,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(pending.length / query.limit),
      },
    };
  },

  async decideApproval(
    departmentId: string,
    userId: string,
    input: DecideHodApprovalInput,
    ipAddress?: string,
    userAgent?: string
  ) {
    // Engine re-validates scope + state transactionally; the pre-check below
    // produces precise 403/404/409 reasons before attempting the write.
    await approvalEngine.assertHodApprovable(input.studentId, departmentId);
    const result = await approvalEngine.decideStudentApproval({
      studentId: input.studentId,
      role: Role.HOD,
      approverUserId: userId,
      departmentId,
      decision: input.decision,
      remarks: input.remarks || null,
      ipAddress,
      userAgent,
    });
    await cacheService.del(`hod:dashboard:${departmentId}`);
    return result;
  },

  // ─── Fee Verifications (department/classroom scope, OR rule) ────────────

  async getFeeVerifications(departmentId: string, query: GetHodFeesQuery) {
    if (query.classroomId) {
      const room = await prisma.classroom.findFirst({
        where: { id: query.classroomId, departmentId },
        select: { id: true },
      });
      if (!room) {
        const exists = await prisma.classroom.findUnique({
          where: { id: query.classroomId },
          select: { id: true },
        });
        if (exists) {
          throw new ForbiddenError("This classroom belongs to another department.");
        }
        throw new NotFoundError("Classroom not found.");
      }
    }
    return hodRepository.getFeeVerifications(departmentId, query);
  },

  async approveFeeVerification(
    departmentId: string,
    userId: string,
    input: ApproveFeeVerificationInput,
    ipAddress?: string,
    userAgent?: string
  ) {
    const result = await approvalEngine.approveFeeVerification({
      studentId: input.studentId,
      role: Role.HOD,
      approverUserId: userId,
      departmentId,
      ipAddress,
      userAgent,
    });
    await cacheService.del(`hod:dashboard:${departmentId}`);
    return result;
  },
};
