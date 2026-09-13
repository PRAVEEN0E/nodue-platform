import { prisma } from "../../plugins/database";
import { Prisma, Role, ApprovalStatus } from "@prisma/client";
import {
  GetStaffSubjectsQuery,
  GetStaffStudentsQuery,
  GetStaffApprovalsQuery,
} from "./staff.schema";

export interface StaffScope {
  staffId: string;
  userId: string;
  departmentId: string;
}

export interface StaffClassRoom {
  id: string;
  name: string;
  batch: string;
  semester: number;
  section: string;
  department: { id: string; code: string; name: string };
}

export interface StaffClass extends StaffClassRoom {
  studentCount: number;
  subjectCount: number;
  pendingCount: number;
}

export interface ClassesResult {
  data: StaffClass[];
  meta: { total: number; page: number; limit: number; totalPages: number };
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

export const staffRepository = {
  // ─── Scope: authenticated user → own staff profile ────────────────────────

  async findStaffScope(userId: string): Promise<StaffScope | null> {
    const staff = await prisma.staff.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        departmentId: true,
        user: { select: { isActive: true, role: true } },
      },
    });
    if (!staff || staff.user.role !== Role.STAFF || !staff.user.isActive) {
      return null;
    }
    return { staffId: staff.id, userId: staff.userId, departmentId: staff.departmentId };
  },

  async getAssignedSubjectIds(staffId: string): Promise<string[]> {
    const rows = await prisma.subjectStaff.findMany({
      where: { staffId },
      select: { subjectId: true },
    });
    return rows.map((r) => r.subjectId);
  },

  async getAssignedSubjectsWithClassrooms(staffId: string) {
    return prisma.subjectStaff.findMany({
      where: { staffId },
      select: {
        subject: {
          select: { id: true, classroomId: true, semester: true },
        },
      },
    });
  },

  // ─── My Classes (assigned classrooms) ────────────────────────────────────
  // A staff member's classes are the DISTINCT classrooms of the subjects they
  // are mapped to. Staff.classroomId (the "adopted" classroom) is ownership
  // metadata only and is never used to derive the teaching scope.

  async getClasses(staffId: string): Promise<ClassesResult> {
    const links = await prisma.subjectStaff.findMany({
      where: { staffId },
      select: { subject: { select: { id: true, classroomId: true } } },
    });
    const classroomIds = [
      ...new Set(links.map((l) => l.subject.classroomId).filter((c): c is string => !!c)),
    ];
    if (classroomIds.length === 0) {
      return { data: [], meta: { total: 0, page: 1, limit: 100, totalPages: 0 } };
    }
    const subjectIds = links.map((l) => l.subject.id);

    const [classrooms, studentCounts, subjectCounts, decidedBySubject] = await Promise.all([
      prisma.classroom.findMany({
        where: { id: { in: classroomIds } },
        select: {
          id: true,
          name: true,
          batch: true,
          semester: true,
          section: true,
          department: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ semester: "desc" }, { section: "asc" }],
      }),
      prisma.student.groupBy({
        by: ["classroomId"],
        where: { classroomId: { in: classroomIds } },
        _count: { classroomId: true },
      }),
      prisma.subject.groupBy({
        by: ["classroomId"],
        where: { classroomId: { in: classroomIds }, subjectStaff: { some: { staffId } } },
        _count: { classroomId: true },
      }),
      prisma.approval.groupBy({
        by: ["subjectId"],
        where: { subjectId: { in: subjectIds }, approverRole: Role.STAFF },
        _count: { subjectId: true },
      }),
    ]);

    const studentsByClass = new Map(studentCounts.map((c) => [c.classroomId, c._count.classroomId]));
    const subjectsByClass = new Map(subjectCounts.map((c) => [c.classroomId, c._count.classroomId]));
    const decidedBySubjectMap = new Map(
      decidedBySubject.map((d) => [d.subjectId as string, d._count.subjectId])
    );

    const data = classrooms.map((c) => {
      let pending = 0;
      for (const l of links) {
        if (l.subject.classroomId !== c.id) continue;
        const total = studentsByClass.get(c.id) ?? 0;
        const decided = decidedBySubjectMap.get(l.subject.id) ?? 0;
        pending += Math.max(0, total - decided);
      }
      return {
        id: c.id,
        name: c.name,
        batch: c.batch,
        semester: c.semester,
        section: c.section,
        department: c.department,
        studentCount: studentsByClass.get(c.id) ?? 0,
        subjectCount: subjectsByClass.get(c.id) ?? 0,
        pendingCount: pending,
      };
    });

    return {
      data,
      meta: { total: data.length, page: 1, limit: data.length, totalPages: data.length > 0 ? 1 : 0 },
    };
  },

  // Returns { classroom, exists }. `classroom` is null when the classroom has
  // no assigned subject for this staff member; `exists` distinguishes a real
  // classroom outside scope (403) from a nonexistent one (404).
  async getClassroomDetail(staffId: string, classroomId: string) {
    const classroom = await prisma.classroom.findFirst({
      where: { id: classroomId, subjects: { some: { subjectStaff: { some: { staffId } } } } },
      select: {
        id: true,
        name: true,
        batch: true,
        semester: true,
        section: true,
        department: { select: { id: true, code: true, name: true } },
        _count: { select: { students: true } },
        subjects: {
          where: { subjectStaff: { some: { staffId } } },
          select: {
            id: true,
            code: true,
            name: true,
            credits: true,
            semester: true,
            _count: { select: { approvals: true } },
          },
          orderBy: { code: "asc" },
        },
      },
    });
    if (!classroom) {
      const exists = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: { id: true },
      });
      return { classroom: null, exists: !!exists };
    }

    const studentCount = classroom._count.students;
    const subjects = classroom.subjects.map((s) => ({
      ...s,
      studentCount,
      pendingCount: Math.max(0, studentCount - s._count.approvals),
    }));
    return { classroom: { ...classroom, studentCount, subjects }, exists: true };
  },

  // ─── Dashboard ────────────────────────────────────────────────────────────

  async getDashboardData(scope: StaffScope) {
    const assignments = await this.getAssignedSubjectsWithClassrooms(scope.staffId);
    const subjectIds = assignments.map((a) => a.subject.id);
    const classroomIds = [...new Set(assignments.map((a) => a.subject.classroomId).filter((c): c is string => !!c))];

    if (subjectIds.length === 0) {
      return {
        counts: { subjects: 0, students: 0, pending: 0, approved: 0, rejected: 0 },
        recentDecisions: [],
      };
    }

    const [studentCount, decidedGroups, recentDecisions] = await Promise.all([
      prisma.student.count({ where: { classroomId: { in: classroomIds } } }),
      prisma.approval.groupBy({
        by: ["status"],
        where: { subjectId: { in: subjectIds }, approverRole: Role.STAFF },
        _count: { status: true },
      }),
      prisma.approval.findMany({
        where: { approverUserId: scope.userId, approverRole: Role.STAFF },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          id: true,
          status: true,
          updatedAt: true,
          student: {
            select: {
              registerNumber: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
          subject: { select: { id: true, code: true, name: true } },
        },
      }),
    ]);

    // Pending pairs = sum over subjects of (classroom students − decided)
    const perSubject = await prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      select: {
        id: true,
        classroomId: true,
        classroom: { select: { _count: { select: { students: true } } } },
        _count: { select: { approvals: true } },
      },
    });
    let pending = 0;
    let decidedTotal = 0;
    for (const s of perSubject) {
      const total = s.classroom?._count.students ?? 0;
      const decided = s._count.approvals;
      pending += Math.max(0, total - decided);
      decidedTotal += decided;
    }

    const byStatus: Record<string, number> = { APPROVED: 0, REJECTED: 0 };
    for (const g of decidedGroups) {
      byStatus[g.status] = g._count.status;
    }

    return {
      counts: {
        subjects: subjectIds.length,
        students: studentCount,
        pending,
        approved: byStatus.APPROVED,
        rejected: byStatus.REJECTED,
      },
      recentDecisions,
    };
  },

  // ─── Subjects ─────────────────────────────────────────────────────────────

  async getSubjects(scope: StaffScope, query: GetStaffSubjectsQuery) {
    const { page, limit, search, semester } = query;
    const subjectWhere: Prisma.SubjectWhereInput = {
      subjectStaff: { some: { staffId: scope.staffId } },
    };
    if (search) {
      subjectWhere.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ];
    }
    if (semester !== undefined) subjectWhere.semester = semester;

    const [subjects, total] = await Promise.all([
      prisma.subject.findMany({
        where: subjectWhere,
        select: {
          id: true,
          code: true,
          name: true,
          credits: true,
          semester: true,
          classroom: {
            select: {
              id: true,
              name: true,
              batch: true,
              section: true,
              _count: { select: { students: true } },
            },
          },
          _count: { select: { approvals: true } },
        },
        orderBy: { code: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.subject.count({ where: subjectWhere }),
    ]);

    return {
      data: subjects,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  async findSubjectInScope(subjectId: string, staffId: string) {
    const link = await prisma.subjectStaff.findUnique({
      where: { subjectId_staffId: { subjectId, staffId } },
      select: {
        subject: {
          select: {
            id: true,
            code: true,
            name: true,
            credits: true,
            semester: true,
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
          },
        },
      },
    });
    return link?.subject ?? null;
  },

  async findSubjectByIdAnywhere(subjectId: string) {
    return prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true },
    });
  },

  async getSubjectStudentsWithDecisions(subjectId: string) {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: {
        id: true,
        classroomId: true,
        classroom: {
          select: {
            students: {
              select: {
                id: true,
                registerNumber: true,
                user: { select: safeUserSelect },
                approvals: {
                  where: { subjectId, approverRole: Role.STAFF },
                  select: { id: true, status: true, updatedAt: true },
                },
              },
              orderBy: { registerNumber: "asc" },
            },
          },
        },
      },
    });
    return subject?.classroom?.students ?? [];
  },

  // ─── Students ─────────────────────────────────────────────────────────────

  async getScopeClassroomIds(staffId: string): Promise<string[]> {
    const assignments = await this.getAssignedSubjectsWithClassrooms(staffId);
    return [...new Set(assignments.map((a) => a.subject.classroomId).filter((c): c is string => !!c))];
  },

  async getStudents(scope: StaffScope, query: GetStaffStudentsQuery) {
    const { page, limit, search, subjectId } = query;
    let classroomIds = await this.getScopeClassroomIds(scope.staffId);

    if (subjectId) {
      // Assignment is pre-validated by the service (403/404); resolve the
      // subject's classroom for narrowing.
      const link = await prisma.subjectStaff.findUnique({
        where: { subjectId_staffId: { subjectId, staffId: scope.staffId } },
        select: { subject: { select: { classroomId: true } } },
      });
      classroomIds = link?.subject.classroomId ? [link.subject.classroomId] : [];
    }

    if (classroomIds.length === 0) {
      return { data: [], meta: { total: 0, page, limit, totalPages: 0 } };
    }

    const where: Prisma.StudentWhereInput = { classroomId: { in: classroomIds } };
    if (search) {
      where.OR = [
        { user: { firstName: { contains: search, mode: "insensitive" } } },
        { user: { lastName: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { registerNumber: { contains: search, mode: "insensitive" } },
      ];
    }

    // Subjects relevant to these classrooms (for per-student decided/total)
    const relevantSubjects = await prisma.subjectStaff.findMany({
      where: { staffId: scope.staffId, subject: { classroomId: { in: classroomIds } } },
      select: { subject: { select: { id: true, classroomId: true } } },
    });
    const subjectIds = relevantSubjects.map((r) => r.subject.id);

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        select: {
          id: true,
          registerNumber: true,
          classroom: { select: { id: true, name: true, batch: true, section: true } },
          user: { select: safeUserSelect },
          approvals: {
            where: { subjectId: { in: subjectIds }, approverRole: Role.STAFF },
            select: { subjectId: true, status: true },
          },
        },
        orderBy: { registerNumber: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.student.count({ where }),
    ]);

    const perClassroomCounts = new Map<string, number>();
    for (const r of relevantSubjects) {
      const cid = r.subject.classroomId;
      if (cid) perClassroomCounts.set(cid, (perClassroomCounts.get(cid) ?? 0) + 1);
    }

    return {
      data: students.map((s) => {
        const totalPairs = perClassroomCounts.get(s.classroom.id) ?? 0;
        return {
          ...s,
          staffDecisions: { decided: s.approvals.length, total: totalPairs },
        };
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  async findStudentInScope(studentId: string, classroomIds: string[]) {
    if (classroomIds.length === 0) return null;
    return prisma.student.findFirst({
      where: { id: studentId, classroomId: { in: classroomIds } },
      select: {
        id: true,
        registerNumber: true,
        rollNumber: true,
        admissionYear: true,
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
        user: { select: safeUserSelect },
        approvals: {
          where: { approverRole: Role.STAFF },
          select: {
            id: true,
            status: true,
            remarks: true,
            updatedAt: true,
            subject: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
  },

  async findStudentByIdAnywhere(studentId: string) {
    return prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
  },

  // ─── Approvals ────────────────────────────────────────────────────────────

  async getDecidedApprovals(
    staffId: string,
    opts: {
      page: number;
      limit: number;
      search?: string;
      subjectId?: string;
      status?: ApprovalStatus;
    }
  ) {
    const where: Prisma.ApprovalWhereInput = {
      approverRole: Role.STAFF,
      subject: { subjectStaff: { some: { staffId } } },
    };
    if (opts.subjectId) where.subjectId = opts.subjectId;
    if (opts.status) where.status = opts.status;
    if (opts.search) {
      where.OR = [
        { student: { registerNumber: { contains: opts.search, mode: "insensitive" } } },
        { student: { user: { firstName: { contains: opts.search, mode: "insensitive" } } } },
        { student: { user: { lastName: { contains: opts.search, mode: "insensitive" } } } },
        { subject: { code: { contains: opts.search, mode: "insensitive" } } },
        { subject: { name: { contains: opts.search, mode: "insensitive" } } },
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
          subject: { select: { id: true, code: true, name: true } },
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

  async getPendingPairs(
    staffId: string,
    opts: { page: number; limit: number; search?: string; subjectId?: string }
  ) {
    // Subjects in scope (optionally narrowed to one assigned subject)
    let links = await prisma.subjectStaff.findMany({
      where: { staffId, ...(opts.subjectId ? { subjectId: opts.subjectId } : {}) },
      select: {
        subject: {
          select: {
            id: true,
            code: true,
            name: true,
            classroomId: true,
            classroom: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (opts.subjectId && links.length === 0) return null; // not assigned → 403/404 upstream

    const subjectIds = links.map((l) => l.subject.id);
    if (subjectIds.length === 0) {
      return { data: [], meta: { total: 0, page: opts.page, limit: opts.limit, totalPages: 0 } };
    }

    const classroomIds = [...new Set(links.map((l) => l.subject.classroomId).filter((c): c is string => !!c))];
    if (classroomIds.length === 0) {
      return { data: [], meta: { total: 0, page: opts.page, limit: opts.limit, totalPages: 0 } };
    }

    const studentWhere: Prisma.StudentWhereInput = { classroomId: { in: classroomIds } };
    if (opts.search) {
      studentWhere.OR = [
        { registerNumber: { contains: opts.search, mode: "insensitive" } } ,
        { user: { firstName: { contains: opts.search, mode: "insensitive" } } },
        { user: { lastName: { contains: opts.search, mode: "insensitive" } } },
      ];
    }

    // Exact total: per subject, classroom students minus decided pairs
    const [classCounts, decidedCounts] = await Promise.all([
      prisma.student.groupBy({
        by: ["classroomId"],
        where: studentWhere,
        _count: { classroomId: true },
      }),
      prisma.approval.groupBy({
        by: ["subjectId"],
        where: { subjectId: { in: subjectIds }, approverRole: Role.STAFF },
        _count: { subjectId: true },
      }),
    ]);
    const decidedBySubject = new Map(decidedCounts.map((d) => [d.subjectId as string, d._count.subjectId]));
    const studentsByClass = new Map(classCounts.map((c) => [c.classroomId, c._count.classroomId]));
    let total = 0;
    for (const l of links) {
      const cid = l.subject.classroomId;
      const sCount = cid ? studentsByClass.get(cid) ?? 0 : 0;
      const dCount = decidedBySubject.get(l.subject.id) ?? 0;
      total += Math.max(0, sCount - dCount);
    }

    // Pair expansion is done in service over a bounded classroom-scale window
    // so pagination over the pair space stays exact.
    const students = await prisma.student.findMany({
      where: studentWhere,
      select: {
        id: true,
        registerNumber: true,
        classroomId: true,
        classroom: { select: { id: true, name: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        approvals: {
          where: { subjectId: { in: subjectIds }, approverRole: Role.STAFF },
          select: { subjectId: true },
        },
      },
      orderBy: { registerNumber: "asc" },
      take: 500,
    });

    const subjectById = new Map(links.map((l) => [l.subject.id, l.subject]));
    const allPairs: Array<Record<string, unknown>> = [];
    for (const s of students) {
      const decided = new Set(s.approvals.map((a) => a.subjectId));
      for (const l of links) {
        if (l.subject.classroomId !== s.classroomId) continue;
        if (decided.has(l.subject.id)) continue;
        allPairs.push({
          student: {
            id: s.id,
            registerNumber: s.registerNumber,
            classroom: s.classroom,
            user: s.user,
          },
          subject: subjectById.get(l.subject.id),
          status: "PENDING",
        });
      }
    }

    const start = (opts.page - 1) * opts.limit;
    return {
      data: allPairs.slice(start, start + opts.limit),
      meta: { total, page: opts.page, limit: opts.limit, totalPages: Math.ceil(total / opts.limit) },
    };
  },

  async findDecision(studentId: string, subjectId: string) {
    return prisma.approval.findUnique({
      where: {
        studentId_subjectId_approverRole: { studentId, subjectId, approverRole: Role.STAFF },
      },
      select: {
        id: true,
        status: true,
        remarks: true,
        createdAt: true,
        updatedAt: true,
        approverUserId: true,
        student: {
          select: {
            id: true,
            registerNumber: true,
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        subject: { select: { id: true, code: true, name: true } },
      },
    });
  },

  async createDecision(input: {
    studentId: string;
    subjectId: string;
    approverUserId: string;
    status: ApprovalStatus;
    remarks: string | null;
  }) {
    return prisma.approval.create({
      data: {
        studentId: input.studentId,
        subjectId: input.subjectId,
        approverRole: Role.STAFF,
        approverUserId: input.approverUserId,
        status: input.status,
        remarks: input.remarks,
      },
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
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        subject: { select: { id: true, code: true, name: true } },
      },
    });
  },
};
