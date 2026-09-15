import { prisma } from "../../plugins/database";
import { Prisma, Role } from "@prisma/client";
import {
  CreateClassroomInput,
  UpdateClassroomInput,
  GetClassroomsQuery,
  CreateAdvisorInput,
  UpdateAdvisorInput,
  GetAdvisorsQuery,
  GetHodAuditLogsQuery,
  GetHodApprovalsQuery,
  GetHodFeesQuery,
} from "./hod.schema";

export const hodRepository = {
  // ─── Department Overview & Metrics ──────────────────────────────────────────

  async getDepartmentDetails(departmentId: string) {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        hodUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            classrooms: true,
            students: true,
            staff: true,
          },
        },
      },
    });

    if (!department) return null;

    const [advisorCount, assignedClassroomsCount, unassignedClassroomsCount] = await Promise.all([
      prisma.user.count({
        where: { departmentId, role: Role.ADVISOR },
      }),
      prisma.classroom.count({
        where: { departmentId, advisor: { isNot: null } },
      }),
      prisma.classroom.count({
        where: { departmentId, advisor: null },
      }),
    ]);

    return {
      id: department.id,
      code: department.code,
      name: department.name,
      hodUser: department.hodUser,
      counts: {
        classrooms: department._count.classrooms,
        assignedClassrooms: assignedClassroomsCount,
        unassignedClassrooms: unassignedClassroomsCount,
        advisors: advisorCount,
        students: department._count.students,
        staff: department._count.staff,
      },
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
    };
  },

  async updateDepartment(departmentId: string, name: string) {
    return prisma.department.update({
      where: { id: departmentId },
      data: { name },
      select: {
        id: true,
        code: true,
        name: true,
        updatedAt: true,
      },
    });
  },

  // ─── Classroom Repository Methods ───────────────────────────────────────────

  async getClassroomById(id: string, departmentId: string) {
    return prisma.classroom.findFirst({
      where: { id, departmentId },
      include: {
        advisor: {
          select: {
            id: true,
            userId: true,
            assignedAt: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                isActive: true,
              },
            },
          },
        },
        _count: {
          select: {
            students: true,
            subjects: true,
          },
        },
      },
    });
  },

  async findClassroomByUniqueIdentity(departmentId: string, name: string, batch: string, semester: number, section: string) {
    return prisma.classroom.findFirst({
      where: {
        departmentId,
        OR: [
          { name },
          { batch, semester, section },
        ],
      },
    });
  },

  async getPaginatedClassrooms(departmentId: string, query: GetClassroomsQuery) {
    const { page, limit, search, semester, batch, section } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ClassroomWhereInput = { departmentId };

    if (semester !== undefined) where.semester = semester;
    if (batch) where.batch = { equals: batch, mode: "insensitive" };
    if (section) where.section = { equals: section, mode: "insensitive" };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { batch: { contains: search, mode: "insensitive" } },
        { section: { contains: search, mode: "insensitive" } },
      ];
    }

    const [classrooms, total] = await Promise.all([
      prisma.classroom.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ semester: "asc" }, { section: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          batch: true,
          semester: true,
          section: true,
          departmentId: true,
          createdAt: true,
          updatedAt: true,
          advisor: {
            select: {
              id: true,
              userId: true,
              assignedAt: true,
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  isActive: true,
                },
              },
            },
          },
          _count: {
            select: {
              students: true,
            },
          },
        },
      }),
      prisma.classroom.count({ where }),
    ]);

    return {
      data: classrooms,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async createClassroom(departmentId: string, data: CreateClassroomInput) {
    return prisma.classroom.create({
      data: {
        name: data.name,
        batch: data.batch,
        semester: data.semester,
        section: data.section,
        departmentId,
      },
      select: {
        id: true,
        name: true,
        batch: true,
        semester: true,
        section: true,
        departmentId: true,
        createdAt: true,
      },
    });
  },

  async updateClassroom(id: string, departmentId: string, data: UpdateClassroomInput) {
    return prisma.classroom.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.batch !== undefined && { batch: data.batch }),
        ...(data.semester !== undefined && { semester: data.semester }),
        ...(data.section !== undefined && { section: data.section }),
      },
      select: {
        id: true,
        name: true,
        batch: true,
        semester: true,
        section: true,
        departmentId: true,
        updatedAt: true,
      },
    });
  },

  // ─── Advisor Repository Methods ─────────────────────────────────────────────

  async getAdvisorById(id: string, departmentId: string) {
    // id may be the Advisor model ID or the User ID
    const advisor = await prisma.advisor.findFirst({
      where: {
        OR: [{ id }, { userId: id }],
        user: { departmentId },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            isActive: true,
            departmentId: true,
            createdAt: true,
          },
        },
        classroom: {
          select: {
            id: true,
            name: true,
            batch: true,
            semester: true,
            section: true,
            departmentId: true,
          },
        },
      },
    });

    return advisor;
  },

  async getPaginatedAdvisors(departmentId: string, query: GetAdvisorsQuery) {
    const { page, limit, search, isActive, classroomId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: Role.ADVISOR,
      departmentId,
    };

    if (isActive !== undefined) where.isActive = isActive;

    if (classroomId) {
      where.advisorProfile = { classroomId };
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          advisorProfile: {
            select: {
              id: true,
              classroomId: true,
              assignedAt: true,
              classroom: {
                select: {
                  id: true,
                  name: true,
                  batch: true,
                  semester: true,
                  section: true,
                },
              },
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async createAdvisor(
    departmentId: string,
    userData: {
      firstName: string;
      lastName: string;
      email: string;
      passwordHash: string;
    },
    classroomId?: string | null
  ) {
    return prisma.$transaction(async (tx) => {
      // 1. Create User account
      const user = await tx.user.create({
        data: {
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email,
          passwordHash: userData.passwordHash,
          role: Role.ADVISOR,
          departmentId,
          isActive: true,
        },
      });

      // 2. Create Advisor profile
      const advisor = await tx.advisor.create({
        data: {
          userId: user.id,
          classroomId: classroomId || null,
        },
        include: {
          classroom: {
            select: {
              id: true,
              name: true,
              batch: true,
              semester: true,
              section: true,
            },
          },
        },
      });

      return {
        id: advisor.id,
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
        isActive: user.isActive,
        classroomId: advisor.classroomId,
        classroom: advisor.classroom,
        createdAt: user.createdAt,
      };
    });
  },

  async updateAdvisorUser(userId: string, data: UpdateAdvisorInput) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
        departmentId: true,
        updatedAt: true,
        advisorProfile: {
          select: {
            id: true,
            classroomId: true,
            classroom: {
              select: {
                id: true,
                name: true,
                batch: true,
                semester: true,
                section: true,
              },
            },
          },
        },
      },
    });
  },

  async assignAdvisorToClassroom(
    advisorId: string,
    targetClassroomId: string | null,
    departmentId: string
  ) {
    return prisma.$transaction(async (tx) => {
      // 1. Find the advisor profile (by advisor.id or advisor.userId)
      const advisor = await tx.advisor.findFirst({
        where: {
          OR: [{ id: advisorId }, { userId: advisorId }],
          user: { departmentId },
        },
      });

      if (!advisor) {
        return null;
      }

      // 2. If assigning to a classroom, ensure classroom belongs to department
      // and unassign any other advisor previously assigned to that classroom
      if (targetClassroomId) {
        const classroom = await tx.classroom.findFirst({
          where: { id: targetClassroomId, departmentId },
        });

        if (!classroom) {
          throw new Error("CLASSROOM_NOT_IN_DEPARTMENT");
        }

        // Unlink previous occupant of this classroom if different advisor
        await tx.advisor.updateMany({
          where: {
            classroomId: targetClassroomId,
            id: { not: advisor.id },
          },
          data: { classroomId: null },
        });
      }

      // 3. Update the advisor
      const updated = await tx.advisor.update({
        where: { id: advisor.id },
        data: { classroomId: targetClassroomId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              isActive: true,
            },
          },
          classroom: {
            select: {
              id: true,
              name: true,
              batch: true,
              semester: true,
              section: true,
            },
          },
        },
      });

      return updated;
    });
  },

  // ─── Department Scoped Audit Logs ───────────────────────────────────────────

  async getPaginatedAuditLogs(departmentId: string, query: GetHodAuditLogsQuery) {
    const { page, limit, action, entityType, actorUserId, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      departmentId,
    };

    if (action) where.action = { contains: action, mode: "insensitive" };
    if (entityType) where.entityType = { contains: entityType, mode: "insensitive" };
    if (actorUserId) where.actorUserId = actorUserId;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          actorUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  // ─── Phase 7 Approval / Fee Foundations ─────────────────────────────────────

  async getPendingApprovalsSummary(departmentId: string) {
    const count = await prisma.approval.count({
      where: {
        student: { departmentId },
        status: "PENDING",
      },
    });

    return {
      pendingApprovals: count,
      departmentId,
    };
  },

  async getFeeSummary(departmentId: string) {
    const [totalStudents, verifiedCount] = await Promise.all([
      prisma.student.count({ where: { departmentId } }),
      prisma.feeVerification.count({
        where: {
          student: { departmentId },
          OR: [{ advisorApproved: true }, { hodApproved: true }],
        },
      }),
    ]);

    return {
      departmentId,
      feesSummary: {
        verifiedCount,
        pendingCount: Math.max(totalStudents - verifiedCount, 0),
      },
    };
  },

  // ─── Approvals (Phase 7: HOD stage) ───────────────────────────────────────

  async getApprovalQueueCandidates(departmentId: string, search?: string) {
    const where: Prisma.StudentWhereInput = { departmentId };
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
          where: { approverRole: { in: [Role.ADVISOR, Role.HOD] } },
          select: { approverRole: true, status: true, updatedAt: true },
        },
      },
      orderBy: { registerNumber: "asc" },
      take: 500,
    });
  },

  async getDecidedApprovals(
    departmentId: string,
    opts: { page: number; limit: number; search?: string; status?: "APPROVED" | "REJECTED" }
  ) {
    const where: Prisma.ApprovalWhereInput = {
      approverRole: Role.HOD,
      student: { departmentId },
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

  async getFeeVerifications(departmentId: string, query: GetHodFeesQuery) {
    const { page, limit, search, status, classroomId } = query;
    const studentWhere: Prisma.StudentWhereInput = {
      departmentId,
      ...(classroomId ? { classroomId } : {}),
    };
    if (search) {
      studentWhere.OR = [
        { registerNumber: { contains: search, mode: "insensitive" } },
        { user: { firstName: { contains: search, mode: "insensitive" } } },
        { user: { lastName: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where: studentWhere,
        select: {
          id: true,
          registerNumber: true,
          classroom: { select: { id: true, name: true } },
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

    let data = students.map((s) => ({
      studentId: s.id,
      studentName: `${s.user.firstName} ${s.user.lastName}`,
      registerNumber: s.registerNumber,
      classroomId: s.classroom.id,
      classroomName: s.classroom.name,
      verified: Boolean((s.feeVerification?.advisorApproved ?? false) || (s.feeVerification?.hodApproved ?? false)),
      advisorApproved: s.feeVerification?.advisorApproved ?? false,
      hodApproved: s.feeVerification?.hodApproved ?? false,
    }));

    if (status === "PENDING") data = data.filter((d) => !d.verified);
    else if (status === "VERIFIED") data = data.filter((d) => d.verified);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  async getDepartmentStudentsForReport(departmentId: string) {
    return prisma.student.findMany({
      where: { departmentId },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
        classroom: {
          select: {
            name: true,
            batch: true,
            semester: true,
            section: true,
            subjects: {
              select: { id: true, code: true, name: true },
            },
          },
        },
        feeVerification: {
          select: { advisorApproved: true, hodApproved: true },
        },
        approvals: {
          select: { approverRole: true, subjectId: true, status: true, remarks: true },
        },
      },
      orderBy: [
        { classroom: { name: "asc" } },
        { registerNumber: "asc" },
      ],
    });
  },
};
