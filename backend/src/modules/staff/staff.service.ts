import { staffRepository, StaffScope, ClassesResult } from "./staff.repository";
import { cacheService } from "../../plugins/redis";
import { auditService } from "../../utils/auditService";
import {
  staffDashboardCacheKey,
  staffClassesCacheKey,
  invalidateStaffCache,
} from "./staff.cache";
import { ConflictError, ForbiddenError, NotFoundError } from "../../utils/errors";
import { ApprovalStatus, Role } from "@prisma/client";
import {
  GetStaffSubjectsQuery,
  GetStaffStudentsQuery,
  GetStaffApprovalsQuery,
  DecideApprovalInput,
} from "./staff.schema";

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === "P2002";
}

function auditAction(decision: "APPROVED" | "REJECTED"): string {
  return decision === "APPROVED" ? "STAFF_APPROVAL_APPROVED" : "STAFF_APPROVAL_REJECTED";
}

export const staffService = {
  // ─── Scope ────────────────────────────────────────────────────────────────
  // All authorization derives from the authenticated staff member's own
  // profile and subject assignments. Client-supplied IDs select resources;
  // they never grant access.

  async requireScope(userId: string): Promise<StaffScope> {
    const scope = await staffRepository.findStaffScope(userId);
    if (!scope) {
      throw new ForbiddenError("Staff profile not found or account inactive.");
    }
    return scope;
  },

  async requireAssignedSubject(userId: string, subjectId: string) {
    const scope = await this.requireScope(userId);
    const subject = await staffRepository.findSubjectInScope(subjectId, scope.staffId);
    if (subject) return { scope, subject };

    const exists = await staffRepository.findSubjectByIdAnywhere(subjectId);
    if (exists) {
      throw new ForbiddenError("This subject is not assigned to you.");
    }
    throw new NotFoundError("Subject not found.");
  },

  // ─── Dashboard ────────────────────────────────────────────────────────────

  async getDashboard(userId: string) {
    const cacheKey = staffDashboardCacheKey(userId);
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const scope = await this.requireScope(userId);
    const result = await staffRepository.getDashboardData(scope);
    await cacheService.set(cacheKey, result, 60);
    return result;
  },

  // ─── My Classes (assigned classrooms) ─────────────────────────────────────

  async getClasses(userId: string): Promise<ClassesResult> {
    const cacheKey = staffClassesCacheKey(userId);
    const cached = await cacheService.get<ClassesResult>(cacheKey);
    if (cached) return cached;

    const scope = await this.requireScope(userId);
    const result = await staffRepository.getClasses(scope.staffId);
    await cacheService.set(cacheKey, result, 60);
    return result;
  },

  async getClassroomById(userId: string, classroomId: string) {
    const scope = await this.requireScope(userId);
    const { classroom, exists } = await staffRepository.getClassroomDetail(
      scope.staffId,
      classroomId
    );
    if (classroom) return classroom;
    if (exists) {
      throw new ForbiddenError("This classroom is outside your assigned scope.");
    }
    throw new NotFoundError("Classroom not found.");
  },

  // ─── Subjects ─────────────────────────────────────────────────────────────

  async getSubjects(userId: string, query: GetStaffSubjectsQuery) {
    const scope = await this.requireScope(userId);
    return staffRepository.getSubjects(scope, query);
  },

  async getSubjectById(userId: string, subjectId: string) {
    const { subject } = await this.requireAssignedSubject(userId, subjectId);
    const students = await staffRepository.getSubjectStudentsWithDecisions(subjectId);
    return { ...subject, students };
  },

  // ─── Students ─────────────────────────────────────────────────────────────

  async getStudents(userId: string, query: GetStaffStudentsQuery) {
    const scope = await this.requireScope(userId);
    if (query.subjectId) {
      await this.requireAssignedSubject(userId, query.subjectId);
    }
    return staffRepository.getStudents(scope, query);
  },

  async getStudentById(userId: string, studentId: string) {
    const scope = await this.requireScope(userId);
    const classroomIds = await staffRepository.getScopeClassroomIds(scope.staffId);
    const student = await staffRepository.findStudentInScope(studentId, classroomIds);
    if (student) return student;

    const exists = await staffRepository.findStudentByIdAnywhere(studentId);
    if (exists) {
      throw new ForbiddenError("This student is outside your assigned scope.");
    }
    throw new NotFoundError("Student not found.");
  },

  // ─── Approvals ────────────────────────────────────────────────────────────

  async getApprovals(userId: string, query: GetStaffApprovalsQuery) {
    const scope = await this.requireScope(userId);
    const { page, limit, search, subjectId } = query;
    const status = query.status ?? "pending";

    if (subjectId) {
      await this.requireAssignedSubject(userId, subjectId);
    }

    if (status === "pending") {
      const result = await staffRepository.getPendingPairs(scope.staffId, {
        page,
        limit,
        search,
        subjectId,
      });
      if (result === null) {
        throw new ForbiddenError("This subject is not assigned to you.");
      }
      return result;
    }

    return staffRepository.getDecidedApprovals(scope.staffId, {
      page,
      limit,
      search,
      subjectId,
      status: status === "decided" ? undefined : (status.toUpperCase() as ApprovalStatus),
    });
  },

  async decideApproval(
    userId: string,
    input: DecideApprovalInput,
    ipAddress?: string,
    userAgent?: string
  ) {
    const scope = await this.requireScope(userId);

    // 1. Subject must be assigned to this staff member
    const subject = await staffRepository.findSubjectInScope(input.subjectId, scope.staffId);
    if (!subject) {
      const exists = await staffRepository.findSubjectByIdAnywhere(input.subjectId);
      if (exists) {
        throw new ForbiddenError("This subject is not assigned to you.");
      }
      throw new NotFoundError("Subject not found.");
    }

    // 2. Student must belong to the subject's classroom
    const classroomIds = await staffRepository.getScopeClassroomIds(scope.staffId);
    const student = await staffRepository.findStudentInScope(input.studentId, classroomIds);
    if (!student) {
      throw new ForbiddenError("This student is outside your assigned scope.");
    }
    if (subject.classroom && student.classroom.id !== subject.classroom.id) {
      throw new ForbiddenError("Student and subject belong to different classrooms.");
    }

    // 3. Idempotent decision: same decision returns existing; a different
    // decision on an already-decided pair is rejected (decisions are final at
    // staff stage; later phases own further transitions).
    const existing = await staffRepository.findDecision(input.studentId, input.subjectId);
    if (existing) {
      if (existing.status === input.decision) {
        return { ...existing, idempotent: true as const };
      }
      throw new ConflictError(
        `A ${existing.status} decision is already recorded for this student and subject.`
      );
    }

    const status = input.decision as ApprovalStatus;
    let created;
    try {
      created = await staffRepository.createDecision({
        studentId: input.studentId,
        subjectId: input.subjectId,
        approverUserId: userId,
        status,
        remarks: input.remarks || null,
      });
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        // Concurrent duplicate submission lost the race: re-read and apply
        // the same idempotency rules instead of surfacing a raw conflict.
        const raced = await staffRepository.findDecision(input.studentId, input.subjectId);
        if (raced && raced.status === input.decision) {
          return { ...raced, idempotent: true as const };
        }
        throw new ConflictError("A decision is already recorded for this student and subject.");
      }
      throw err;
    }

    await invalidateStaffCache(userId);
    await auditService.log({
      actorUserId: userId,
      action: auditAction(input.decision),
      entityType: "Approval",
      entityId: created.id,
      metadata: {
        studentId: input.studentId,
        subjectId: input.subjectId,
        subjectCode: subject.code,
        registerNumber: student.registerNumber,
        decision: input.decision,
        role: Role.STAFF,
      },
      ipAddress,
      userAgent,
    });

    return { ...created, idempotent: false as const };
  },
};
