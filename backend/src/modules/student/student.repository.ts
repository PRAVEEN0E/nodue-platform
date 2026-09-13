import { prisma } from "../../plugins/database";
import { Prisma, Role } from "@prisma/client";
import { deriveFinalVerification } from "../approval-engine/approval-engine.service";
import { GetStudentSubjectsQuery } from "./student.schema";

export interface StudentScope {
  studentId: string;
  userId: string;
  classroomId: string;
  departmentId: string;
}

const safeUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  isActive: true,
  departmentId: true,
  createdAt: true,
} as const;

export const studentRepository = {
  // ─── Scope: authenticated user → own student profile ──────────────────────

  async findStudentScope(userId: string): Promise<StudentScope | null> {
    const student = await prisma.student.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        classroomId: true,
        departmentId: true,
        user: { select: { role: true, isActive: true } },
      },
    });
    if (!student || student.user.role !== Role.STUDENT || !student.user.isActive) {
      return null;
    }
    return {
      studentId: student.id,
      userId: student.userId,
      classroomId: student.classroomId,
      departmentId: student.departmentId,
    };
  },

  // ─── Dashboard ────────────────────────────────────────────────────────────

  async getDashboardData(scope: StudentScope) {
    const [student, subjects] = await Promise.all([
      prisma.student.findUnique({
        where: { id: scope.studentId },
        select: {
          id: true,
          registerNumber: true,
          rollNumber: true,
          admissionYear: true,
          user: { select: safeUserSelect },
          classroom: {
            select: {
              id: true,
              name: true,
              batch: true,
              semester: true,
              section: true,
              department: { select: { id: true, code: true, name: true } },
            },
          },
        },
      }),
      prisma.subject.findMany({
        where: { classroomId: scope.classroomId },
        select: {
          id: true,
          approvals: {
            where: { studentId: scope.studentId, approverRole: Role.STAFF },
            select: { status: true },
          },
        },
      }),
    ]);

    let approved = 0;
    let rejected = 0;
    for (const s of subjects) {
      const decision = s.approvals[0]?.status;
      if (decision === "APPROVED") approved++;
      else if (decision === "REJECTED") rejected++;
    }

    return {
      student,
      subjects: {
        total: subjects.length,
        approved,
        rejected,
        pending: subjects.length - approved - rejected,
      },
    };
  },

  // ─── Profile ──────────────────────────────────────────────────────────────

  async getProfile(scope: StudentScope) {
    return prisma.student.findUnique({
      where: { id: scope.studentId },
      select: {
        id: true,
        registerNumber: true,
        rollNumber: true,
        admissionYear: true,
        createdAt: true,
        user: { select: safeUserSelect },
        classroom: {
          select: {
            id: true,
            name: true,
            batch: true,
            semester: true,
            section: true,
            department: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
  },

  // ─── Subjects (own classroom only) ────────────────────────────────────────

  async getSubjects(scope: StudentScope, query: GetStudentSubjectsQuery) {
    const { page, limit, search, semester } = query;
    const where: Prisma.SubjectWhereInput = { classroomId: scope.classroomId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ];
    }
    if (semester !== undefined) where.semester = semester;

    const [subjects, total] = await Promise.all([
      prisma.subject.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          credits: true,
          semester: true,
          subjectStaff: {
            select: {
              staff: {
                select: {
                  id: true,
                  user: { select: { id: true, firstName: true, lastName: true } },
                },
              },
            },
          },
          approvals: {
            where: { studentId: scope.studentId, approverRole: Role.STAFF },
            select: { id: true, status: true, updatedAt: true },
          },
        },
        orderBy: { code: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.subject.count({ where }),
    ]);

    return {
      data: subjects,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  async findSubjectInScope(subjectId: string, scope: StudentScope) {
    return prisma.subject.findFirst({
      where: { id: subjectId, classroomId: scope.classroomId },
      select: {
        id: true,
        code: true,
        name: true,
        credits: true,
        semester: true,
        classroom: { select: { id: true, name: true, batch: true, section: true } },
        subjectStaff: {
          select: {
            staff: {
              select: {
                id: true,
                employeeCode: true,
                user: { select: { id: true, firstName: true, lastName: true, email: true } },
              },
            },
          },
        },
        approvals: {
          where: { studentId: scope.studentId, approverRole: Role.STAFF },
          select: { id: true, status: true, remarks: true, updatedAt: true },
        },
      },
    });
  },

  async findSubjectByIdAnywhere(subjectId: string) {
    return prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true },
    });
  },

  // ─── Status snapshot (all stages read from live engine state) ────────────

  async getStatusSnapshot(scope: StudentScope) {
    const [subjects, roleDecisions, fees, verification] = await Promise.all([
      prisma.subject.findMany({
        where: { classroomId: scope.classroomId },
        select: {
          id: true,
          code: true,
          name: true,
          approvals: {
            where: { studentId: scope.studentId, approverRole: Role.STAFF },
            select: { status: true, updatedAt: true },
          },
        },
        orderBy: { code: "asc" },
      }),
      prisma.approval.findMany({
        where: {
          studentId: scope.studentId,
          subjectId: null,
          approverRole: { in: [Role.ADVISOR, Role.HOD] },
        },
        select: { approverRole: true, status: true, updatedAt: true },
      }),
      prisma.feeVerification.findUnique({
        where: { studentId: scope.studentId },
        select: { advisorApproved: true, hodApproved: true },
      }),
      prisma.student.findUnique({
        where: { id: scope.studentId },
        select: { isVerified: true, verifiedAt: true },
      }),
    ]);

    const perSubject = subjects.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      staffDecision: s.approvals[0]?.status ?? "PENDING",
      decidedAt: s.approvals[0]?.updatedAt ?? null,
    }));

    const decided = perSubject.filter((s) => s.staffDecision !== "PENDING").length;
    const approved = perSubject.filter((s) => s.staffDecision === "APPROVED").length;
    const rejectedCount = perSubject.filter((s) => s.staffDecision === "REJECTED").length;
    const advisorDecision =
      roleDecisions.find((d) => d.approverRole === Role.ADVISOR)?.status ?? "PENDING";
    const hodDecision =
      roleDecisions.find((d) => d.approverRole === Role.HOD)?.status ?? "PENDING";
    const feeSatisfied = (fees?.advisorApproved ?? false) || (fees?.hodApproved ?? false);

    // Final verification is DERIVED from the current pipeline, never trusted
    // from the persisted flag alone: a stale isVerified=true must not surface
    // while prerequisites (subjects / advisor / hod / fee) are incomplete.
    const fv = deriveFinalVerification({
      subjectsTotal: perSubject.length,
      subjectsApproved: approved,
      subjectsRejected: rejectedCount,
      advisorDecision,
      hodDecision,
      feeByAdvisor: fees?.advisorApproved ?? false,
      feeByHod: fees?.hodApproved ?? false,
      isVerified: verification?.isVerified ?? false,
    });

    return {
      staffStage: {
        total: perSubject.length,
        decided,
        approved,
        rejected: rejectedCount,
        pending: perSubject.length - decided,
        subjects: perSubject,
      },
      advisorStage: { decision: advisorDecision },
      hodStage: { decision: hodDecision },
      feeStage: { satisfied: feeSatisfied },
      finalVerification: {
        eligible: fv.eligible,
        state: fv.state,
        verified: fv.complete,
        verifiedAt: fv.complete ? (verification?.verifiedAt ?? null) : null,
      },
    };
  },
};
