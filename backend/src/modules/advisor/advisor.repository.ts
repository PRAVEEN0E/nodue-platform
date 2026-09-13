import { prisma } from "../../plugins/database";
import { Prisma, Role } from "@prisma/client";
import {
  deriveFinalVerification,
  type StageDecision,
} from "../approval-engine/approval-engine.service";
import {
  CreateStudentInput,
  UpdateStudentInput,
  GetStudentsQuery,
  GetStaffQuery,
  GetAvailableStaffQuery,
  CreateSubjectInput,
  UpdateSubjectInput,
  GetSubjectsQuery,
  GetFeeVerificationsQuery,
  GetFinalVerificationQuery,
} from "./advisor.schema";

export interface AdvisorScope {
  advisorId: string;
  userId: string;
  classroomId: string;
  departmentId: string;
}

// ─── Shared selects (never expose password hashes) ──────────────────────────

const safeUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  isActive: true,
  departmentId: true,
  createdAt: true,
  updatedAt: true,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFeeVerification(row: any) {
  return {
    studentId: row.student.id,
    studentName: `${row.student.user.firstName} ${row.student.user.lastName}`,
    registerNumber: row.student.registerNumber,
    verified: Boolean(row.advisorApproved || row.hodApproved),
    advisorApproved: row.advisorApproved,
    hodApproved: row.hodApproved,
  };
}

export const advisorRepository = {
  // ─── Scope resolution: server-side identity → classroom + department ──────

  async findAdvisorScope(userId: string): Promise<AdvisorScope | null> {
    const advisor = await prisma.advisor.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        classroomId: true,
        user: { select: { departmentId: true, isActive: true } },
      },
    });

    if (!advisor || !advisor.classroomId || !advisor.user.departmentId || !advisor.user.isActive) {
      return null;
    }

    return {
      advisorId: advisor.id,
      userId: advisor.userId,
      classroomId: advisor.classroomId,
      departmentId: advisor.user.departmentId,
    };
  },

  async getClassroomDetails(classroomId: string) {
    return prisma.classroom.findUnique({
      where: { id: classroomId },
      select: {
        id: true,
        name: true,
        batch: true,
        semester: true,
        section: true,
        department: { select: { id: true, code: true, name: true } },
        _count: { select: { students: true, subjects: true } },
      },
    });
  },

  // ─── Dashboard ────────────────────────────────────────────────────────────

  async getDashboardData(scope: AdvisorScope) {
    const { classroomId, departmentId } = scope;

    const [
      studentCount,
      subjectCount,
      staffCount,
      unmappedSubjects,
      verifiedCount,
      recentActivity,
    ] = await Promise.all([
      prisma.student.count({ where: { classroomId } }),
      prisma.subject.count({ where: { classroomId } }),
      // Staff count uses the same classroomId membership the staff list uses,
      // keeping the dashboard count exactly consistent with the staff page.
      prisma.staff.count({ where: { classroomId } }),
      prisma.subject.count({
        where: { classroomId, subjectStaff: { none: {} } },
      }),
      prisma.feeVerification.count({
        where: {
          student: { classroomId },
          OR: [{ advisorApproved: true }, { hodApproved: true }],
        },
      }),
      prisma.auditLog.findMany({
        where: { departmentId },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          createdAt: true,
          actorUser: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
        },
      }),
    ]);

    return {
      counts: {
        students: studentCount,
        subjects: subjectCount,
        staff: staffCount,
        unmappedSubjects,
      },
      fees: {
        verified: verifiedCount,
        pending: studentCount - verifiedCount,
      },
      recentActivity,
    };
  },

  // ─── Students ─────────────────────────────────────────────────────────────

  async getStudents(scope: AdvisorScope, query: GetStudentsQuery) {
    const { page, limit, search, isActive } = query;
    const where: Prisma.StudentWhereInput = { classroomId: scope.classroomId };

    if (search) {
      where.OR = [
        { user: { firstName: { contains: search, mode: "insensitive" } } },
        { user: { lastName: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { registerNumber: { contains: search, mode: "insensitive" } },
      ];
    }
    if (isActive !== undefined) {
      where.user = { isActive };
    }

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        select: {
          id: true,
          registerNumber: true,
          rollNumber: true,
          admissionYear: true,
          createdAt: true,
          user: { select: safeUserSelect },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.student.count({ where }),
    ]);

    return {
      data: students,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  async findStudentInScope(studentId: string, classroomId: string) {
    return prisma.student.findFirst({
      where: { id: studentId, classroomId },
      select: {
        id: true,
        registerNumber: true,
        rollNumber: true,
        admissionYear: true,
        classroomId: true,
        createdAt: true,
        user: { select: safeUserSelect },
      },
    });
  },

  async findStudentByIdAnywhere(studentId: string) {
    return prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, classroomId: true },
    });
  },

  async findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email }, select: { id: true } });
  },

  async findStudentByRegisterNumber(registerNumber: string) {
    return prisma.student.findUnique({ where: { registerNumber }, select: { id: true } });
  },

  async createStudent(
    scope: AdvisorScope,
    input: CreateStudentInput & { passwordHash: string }
  ) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          passwordHash: input.passwordHash,
          role: Role.STUDENT,
          departmentId: scope.departmentId,
          isActive: true,
        },
      });

      const student = await tx.student.create({
        data: {
          userId: user.id,
          registerNumber: input.registerNumber,
          rollNumber: input.rollNumber || null,
          classroomId: scope.classroomId,
          departmentId: scope.departmentId,
          admissionYear: input.admissionYear,
        },
      });

      return { userId: user.id, studentId: student.id };
    });
  },

  async updateStudentUser(
    userId: string,
    data: Pick<UpdateStudentInput, "firstName" | "lastName" | "email" | "isActive">
  ) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      select: { id: true },
    });
  },

  async updateStudentProfile(
    studentId: string,
    data: Pick<UpdateStudentInput, "rollNumber" | "admissionYear">
  ) {
    return prisma.student.update({
      where: { id: studentId },
      data: {
        ...(data.rollNumber !== undefined && { rollNumber: data.rollNumber || null }),
        ...(data.admissionYear !== undefined && { admissionYear: data.admissionYear }),
      },
      select: { id: true },
    });
  },

  // ─── Staff (assignment/discovery only; accounts are ADMIN-owned) ─────────
  // Assigned staff = anyone teaching in the advisor's own classroom
  // (subjectStaff -> subject in scope.classroomId). Staff are college-wide, so
  // neither home department nor the adoption classroom (Staff.classroomId,
  // which is set on FIRST assignment only) may gate which staff the advisor
  // can see or extend with additional subjects.

  async getStaff(scope: AdvisorScope, query: GetStaffQuery) {
    const { page, limit, search, isActive } = query;
    // Classroom membership via teaching assignments only: staff visible as
    // assigned to this advisor when their subjects live in the advisor's
    // classroom, regardless of department origin.
    const where: Prisma.StaffWhereInput = {
      subjectStaff: { some: { subject: { classroomId: scope.classroomId } } },
    };

    if (search) {
      where.OR = [
        { user: { firstName: { contains: search, mode: "insensitive" } } },
        { user: { lastName: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { employeeCode: { contains: search, mode: "insensitive" } },
      ];
    }
    if (isActive !== undefined) {
      where.user = { isActive };
    }

    const [staff, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        select: {
          id: true,
          employeeCode: true,
          designation: true,
          createdAt: true,
          user: { select: safeUserSelect },
          subjectStaff: {
            where: { subject: { classroomId: scope.classroomId } },
            select: {
              subject: { select: { id: true, code: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.staff.count({ where }),
    ]);

    return {
      data: staff,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  // College-wide eligible staff for assignment: any ACTIVE staff member in any
  // department may be assigned, provided they are not already teaching a
  // subject in THIS advisor's classroom. Because teaching scope comes from the
  // subject mapping (assignment → classroom → department), staff are not
  // restricted by their profile department; a staff member teaching in another
  // department's classroom remains selectable here. A staff member already
  // mapped to a subject in this classroom is excluded from the list.
  async getAvailableStaff(scope: AdvisorScope, query: GetAvailableStaffQuery) {
    const { page, limit, search } = query;
    const where: Prisma.StaffWhereInput = {
      user: { isActive: true },
      subjectStaff: { none: { subject: { classroomId: scope.classroomId } } },
    };

    if (search) {
      where.OR = [
        { user: { firstName: { contains: search, mode: "insensitive" } } },
        { user: { lastName: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { employeeCode: { contains: search, mode: "insensitive" } },
      ];
    }

    const [staff, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        select: {
          id: true,
          employeeCode: true,
          designation: true,
          classroomId: true,
          createdAt: true,
          user: { select: safeUserSelect },
          department: { select: { id: true, code: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.staff.count({ where }),
    ]);

    return {
      data: staff,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  async findStaffInClassroom(staffId: string, departmentId: string, classroomId: string) {
    return prisma.staff.findFirst({
      where: { id: staffId, departmentId, classroomId },
      select: {
        id: true,
        employeeCode: true,
        designation: true,
        departmentId: true,
        classroomId: true,
        createdAt: true,
        user: { select: safeUserSelect },
        subjectStaff: {
          where: { subject: { classroomId } },
          select: {
            subject: { select: { id: true, code: true, name: true, classroomId: true } },
          },
        },
      },
    });
  },

  // Staff lookup for assignment. Staff are college-wide: a staff member from
  // any department may be mapped to this advisor's classroom subjects. No
  // department filter is applied here; the staff member's teaching scope is
  // derived purely from the assignment (assignment → classroom → department).
  async findStaffForAssignment(staffId: string) {
    return prisma.staff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        employeeCode: true,
        designation: true,
        departmentId: true,
        classroomId: true,
        createdAt: true,
        user: { select: safeUserSelect },
      },
    });
  },

  async findStaffByIdAnywhere(staffId: string) {
    return prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true, departmentId: true, classroomId: true },
    });
  },

  // ─── Subjects (classroom scope) ───────────────────────────────────────────

  async getSubjects(scope: AdvisorScope, query: GetSubjectsQuery) {
    const { page, limit, search, semester } = query;
    const where: Prisma.SubjectWhereInput = { classroomId: scope.classroomId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ];
    }
    if (semester !== undefined) {
      where.semester = semester;
    }

    const [subjects, total] = await Promise.all([
      prisma.subject.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          credits: true,
          semester: true,
          classroomId: true,
          createdAt: true,
          subjectStaff: {
            select: {
              staff: {
                select: {
                  id: true,
                  employeeCode: true,
                  user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
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

  async findSubjectInScope(subjectId: string, classroomId: string) {
    return prisma.subject.findFirst({
      where: { id: subjectId, classroomId },
      select: {
        id: true,
        code: true,
        name: true,
        credits: true,
        semester: true,
        classroomId: true,
        createdAt: true,
        subjectStaff: {
          select: {
            staff: {
              select: {
                id: true,
                employeeCode: true,
                designation: true,
                user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
              },
            },
          },
        },
      },
    });
  },

  async findSubjectByIdAnywhere(subjectId: string) {
    return prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, classroomId: true },
    });
  },

  async findSubjectByCode(code: string) {
    return prisma.subject.findUnique({ where: { code }, select: { id: true } });
  },

  async createSubject(scope: AdvisorScope, input: CreateSubjectInput) {
    return prisma.subject.create({
      data: {
        code: input.code,
        name: input.name,
        credits: input.credits,
        semester: input.semester,
        departmentId: scope.departmentId,
        classroomId: scope.classroomId,
      },
      select: { id: true },
    });
  },

  async updateSubject(subjectId: string, input: UpdateSubjectInput) {
    return prisma.subject.update({
      where: { id: subjectId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.credits !== undefined && { credits: input.credits }),
        ...(input.semester !== undefined && { semester: input.semester }),
      },
      select: { id: true },
    });
  },

  // ─── Subject ↔ Staff mapping (both sides scope-validated by service) ──────

  async findMapping(subjectId: string, staffId: string) {
    return prisma.subjectStaff.findUnique({
      where: { subjectId_staffId: { subjectId, staffId } },
      select: { subjectId: true, staffId: true, staff: { select: { userId: true } } },
    });
  },

  async createMapping(subjectId: string, staffId: string, classroomId: string | null) {
    return prisma.$transaction(async (tx) => {
      // If the staff member is an unassigned department member (classroomId
      // NULL), adopt them into this classroom as part of the mapping so the
      // mapping, the staff list, and the dashboard count stay consistent.
      if (classroomId) {
        await tx.staff.updateMany({
          where: { id: staffId, classroomId: null },
          data: { classroomId },
        });
      }
      return tx.subjectStaff.create({
        data: { subjectId, staffId },
        select: { subjectId: true, staffId: true, createdAt: true },
      });
    });
  },

  async deleteMapping(subjectId: string, staffId: string) {
    return prisma.subjectStaff.delete({
      where: { subjectId_staffId: { subjectId, staffId } },
      select: { subjectId: true, staffId: true },
    });
  },

  // ─── Fee Verifications (student-level, classroom-scoped) ─────────────────

  async getFeeVerifications(scope: AdvisorScope, query: GetFeeVerificationsQuery) {
    const { page, limit, search, status } = query;

    // First get all students in this classroom with their fee verification status
    const studentWhere: Prisma.StudentWhereInput = { classroomId: scope.classroomId };
    if (search) {
      studentWhere.OR = [
        { user: { firstName: { contains: search, mode: "insensitive" } } },
        { user: { lastName: { contains: search, mode: "insensitive" } } },
        { registerNumber: { contains: search, mode: "insensitive" } },
      ];
    }

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where: studentWhere,
        select: {
          id: true,
          registerNumber: true,
          user: { select: { id: true, firstName: true, lastName: true } },
          feeVerification: {
            select: { advisorApproved: true, hodApproved: true },
          },
        },
        orderBy: { registerNumber: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.student.count({ where: studentWhere }),
    ]);

    const data = students.map((s) => ({
      studentId: s.id,
      studentName: `${s.user.firstName} ${s.user.lastName}`,
      registerNumber: s.registerNumber,
      verified: Boolean((s.feeVerification?.advisorApproved ?? false) || (s.feeVerification?.hodApproved ?? false)),
      advisorApproved: s.feeVerification?.advisorApproved ?? false,
      hodApproved: s.feeVerification?.hodApproved ?? false,
    }));

    // Apply status filter after mapping
    const filtered = status === "PENDING" ? data.filter((d) => !d.verified)
      : status === "VERIFIED" ? data.filter((d) => d.verified)
      : data;

    return {
      data: filtered,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  // ─── Final Verification (classroom scope; re-derived from current state) ──
  // The persisted Student.isVerified flag is engine-owned AUDIT state that is
  // monotonic and historically immutable. A stale flag must never surface a
  // student whose CURRENT pipeline is incomplete, so this query loads the
  // candidates (classroom + isVerified) together with their live approvals
  // and fee state and re-derives the final verification via the shared
  // engine derivation — a student appears ONLY when the current pipeline
  // satisfies every prerequisite AND the flag is set. This query filters by
  // the authenticated advisor's classroom BEFORE any search/count, so a
  // student from another classroom can never be listed, counted, or found by
  // search regardless of the query string.

  async getFinalVerifications(scope: AdvisorScope, query: GetFinalVerificationQuery) {
    const { page, limit, search } = query;

    if (!scope.classroomId) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }

    const stale = await prisma.student.findMany({
      where: { classroomId: scope.classroomId, isVerified: true },
      select: {
        id: true,
        registerNumber: true,
        rollNumber: true,
        admissionYear: true,
        verifiedAt: true,
        user: { select: safeUserSelect },
        classroom: { select: { subjects: { select: { id: true } } } },
        approvals: { select: { approverRole: true, subjectId: true, status: true } },
        feeVerification: { select: { advisorApproved: true, hodApproved: true } },
      },
    });

    const complete: typeof stale = [];
    for (const s of stale) {
      const subjectStatus = new Map<string, StageDecision>();
      let advisorDecision: StageDecision = "PENDING";
      let hodDecision: StageDecision = "PENDING";
      for (const a of s.approvals) {
        if (a.approverRole === Role.STAFF && a.subjectId) {
          subjectStatus.set(a.subjectId, (a.status as StageDecision) ?? "PENDING");
        } else if (a.approverRole === Role.ADVISOR && !a.subjectId) {
          advisorDecision = (a.status as StageDecision) ?? "PENDING";
        } else if (a.approverRole === Role.HOD && !a.subjectId) {
          hodDecision = (a.status as StageDecision) ?? "PENDING";
        }
      }
      const statuses = [...subjectStatus.values()];
      const fv = deriveFinalVerification({
        subjectsTotal: s.classroom.subjects.length,
        subjectsApproved: statuses.filter((v) => v === "APPROVED").length,
        subjectsRejected: statuses.filter((v) => v === "REJECTED").length,
        advisorDecision,
        hodDecision,
        feeByAdvisor: s.feeVerification?.advisorApproved ?? false,
        feeByHod: s.feeVerification?.hodApproved ?? false,
        isVerified: true,
      });
      if (fv.state === "COMPLETE") {
        complete.push(s);
      }
    }

    let rows = complete.map((s) => ({
      id: s.id,
      registerNumber: s.registerNumber,
      rollNumber: s.rollNumber,
      admissionYear: s.admissionYear,
      verifiedAt: s.verifiedAt,
      user: s.user,
    }));

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.user.firstName.toLowerCase().includes(q) ||
          r.user.lastName.toLowerCase().includes(q) ||
          (r.user.email ?? "").toLowerCase().includes(q) ||
          r.registerNumber.toLowerCase().includes(q)
      );
    }

    rows.sort((a, b) => (b.verifiedAt?.getTime() ?? 0) - (a.verifiedAt?.getTime() ?? 0));
    const total = rows.length;
    const data = rows.slice((page - 1) * limit, page * limit);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  async findStudentFeeVerification(studentId: string, classroomId: string) {
    return prisma.student.findFirst({
      where: { id: studentId, classroomId },
      select: {
        id: true,
        registerNumber: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        feeVerification: {
          select: { advisorApproved: true, hodApproved: true },
        },
      },
    });
  },
  // Phase 7: advisor approval queue
  async getApprovalQueueCandidates(classroomId: string, search?: string) {
    const where: Prisma.StudentWhereInput = { classroomId };
    if (search) {
      where.OR = [
        { user: { firstName: { contains: search, mode: "insensitive" } } },
        { user: { lastName: { contains: search, mode: "insensitive" } } },
        { registerNumber: { contains: search, mode: "insensitive" } },
      ];
    }
    return prisma.student.findMany({
      where,
      select: {
        id: true,
        registerNumber: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, isActive: true },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            subjects: {
              select: {
                id: true,
                code: true,
                name: true,
                approvals: {
                  where: { approverRole: Role.STAFF },
                  select: { studentId: true, status: true },
                },
              },
              orderBy: { code: "asc" },
            },
          },
        },
        approvals: {
          where: { approverRole: Role.ADVISOR },
          select: { id: true, status: true, remarks: true, updatedAt: true },
        },
      },
      orderBy: { registerNumber: "asc" },
      take: 500,
    });
  },

  async getDecidedApprovals(
    classroomId: string,
    opts: { page: number; limit: number; search?: string; status?: "APPROVED" | "REJECTED" }
  ) {
    const where: Prisma.ApprovalWhereInput = {
      approverRole: Role.ADVISOR,
      student: { classroomId },
    };
    if (opts.status) where.status = opts.status;
    if (opts.search) {
      where.OR = [
        { student: { registerNumber: { contains: opts.search, mode: "insensitive" } } },
        { student: { user: { firstName: { contains: opts.search, mode: "insensitive" } } } },
        { student: { user: { lastName: { contains: opts.search, mode: "insensitive" } } } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.approval.findMany({
        where,
        select: {
          id: true,
          status: true,
          remarks: true,
          createdAt: true,
          updatedAt: true,
          student: {
            select: {
              id: true,
              registerNumber: true,
              classroom: { select: { id: true, name: true } },
              user: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
      }),
      prisma.approval.count({ where }),
    ]);

    return {
      data: rows,
      meta: { total, page: opts.page, limit: opts.limit, totalPages: Math.ceil(total / opts.limit) },
    };
  },

};
