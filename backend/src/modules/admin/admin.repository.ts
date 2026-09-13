import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../plugins/database";
import {
  GetUsersQuery,
  GetHodsQuery,
  GetAuditLogsQuery,
  GetStaffQuery,
  CreateStaffInput,
  UpdateStaffInput,
} from "./admin.schema";

// ─── Safe user select (never returns passwordHash or token secrets) ───────────

const safeUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  departmentId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  department: {
    select: { id: true, code: true, name: true },
  },
} satisfies Prisma.UserSelect;

// ─── Dashboard Aggregates ─────────────────────────────────────────────────────

export const adminRepository = {
  async getDashboardMetrics() {
    // Single-round efficient parallel queries — avoids multiple serial round trips
    const [
      totalUsers,
      activeUsers,
      totalDepartments,
      departmentsWithHod,
      recentActivities,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.department.count(),
      prisma.department.count({ where: { hodUserId: { not: null } } }),
      prisma.auditLog.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          createdAt: true,
          ipAddress: true,
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
    ]);

    return {
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      totalDepartments,
      departmentsWithHod,
      departmentsWithoutHod: totalDepartments - departmentsWithHod,
      recentActivities,
    };
  },

  // ─── Departments with full aggregation ──────────────────────────────────────

  async getDepartmentsWithStats() {
    return prisma.department.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        hodUserId: true,
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
  },

  // ─── HOD Management ─────────────────────────────────────────────────────────

  async getHods(filters: GetHodsQuery) {
    const where: Prisma.UserWhereInput = { role: Role.HOD };

    if (filters.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: "insensitive" } },
        { lastName: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    if (filters.departmentId) {
      where.departmentId = filters.departmentId;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    return prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        ...safeUserSelect,
        advisorProfile: false,
        studentProfile: false,
        staffProfile: false,
      },
    });
  },

  async findDepartmentById(id: string) {
    return prisma.department.findUnique({
      where: { id },
      select: { id: true, code: true, name: true, hodUserId: true },
    });
  },

  async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
  },

  // Atomic transaction: create HOD user + assign to department
  async createHodWithDepartmentAssignment(data: {
    firstName: string;
    lastName: string;
    email: string;
    passwordHash: string;
    departmentId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      // Step 1: Create the user
      const newUser = await tx.user.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          passwordHash: data.passwordHash,
          role: Role.HOD,
          departmentId: data.departmentId,
          isActive: true,
        },
        select: safeUserSelect,
      });

      // Step 2: Atomically assign as HOD (DB unique constraint is the final guard)
      await tx.department.update({
        where: { id: data.departmentId },
        data: { hodUserId: newUser.id },
      });

      return newUser;
    });
  },

  async updateUserStatus(userId: string, isActive: boolean) {
    return prisma.user.update({
      where: { id: userId, role: Role.HOD },
      data: { isActive },
      select: safeUserSelect,
    });
  },

  // ─── Paginated Users ─────────────────────────────────────────────────────────

  async getPaginatedUsers(query: GetUsersQuery) {
    const { page, limit, search, role, departmentId, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (role) where.role = role;
    if (departmentId) where.departmentId = departmentId;
    if (isActive !== undefined) where.isActive = isActive;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: safeUserSelect,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  // ─── Paginated Audit Logs ────────────────────────────────────────────────────

  async getPaginatedAuditLogs(query: GetAuditLogsQuery) {
    const { page, limit, action, entityType, actorUserId, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

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
          departmentId: true,
          department: {
            select: { id: true, code: true, name: true },
          },
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
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  // ─── Staff Management (ADMIN-only lifecycle) ───────────────────────────────
  // Staff created here enter an unassigned department pool (classroomId NULL).
  // Advisors never create or edit staff; they only assign existing staff by
  // mapping them to authorized classroom subjects (advisor module).

  async getStaff(filters: GetStaffQuery) {
    const { page, limit, search, departmentId, isActive } = filters;
    const where: Prisma.StaffWhereInput = {};

    if (departmentId) where.departmentId = departmentId;
    if (isActive !== undefined) where.user = { isActive };

    if (search) {
      where.OR = [
        { user: { firstName: { contains: search, mode: "insensitive" } } },
        { user: { lastName: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { employeeCode: { contains: search, mode: "insensitive" } },
        { designation: { contains: search, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          employeeCode: true,
          designation: true,
          departmentId: true,
          classroomId: true,
          createdAt: true,
          updatedAt: true,
          user: { select: safeUserSelect },
          classroom: { select: { id: true, name: true } },
          _count: { select: { subjectStaff: true } },
        },
      }),
      prisma.staff.count({ where }),
    ]);

    return {
      data: rows,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async findStaffById(staffId: string) {
    return prisma.staff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        userId: true,
        employeeCode: true,
        designation: true,
        departmentId: true,
        classroomId: true,
        createdAt: true,
        user: { select: safeUserSelect },
        _count: { select: { subjectStaff: true } },
      },
    });
  },

  async findStaffByEmployeeCode(employeeCode: string) {
    return prisma.staff.findUnique({ where: { employeeCode }, select: { id: true } });
  },

  async createStaffAccount(
    data: CreateStaffInput & { passwordHash: string }
  ): Promise<{ staffId: string; userId: string }> {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          passwordHash: data.passwordHash,
          role: Role.STAFF,
          departmentId: data.departmentId,
          isActive: data.isActive,
        },
        select: { id: true },
      });

      const staff = await tx.staff.create({
        data: {
          userId: user.id,
          employeeCode: data.employeeCode,
          departmentId: data.departmentId,
          // Admin-created staff join the unassigned department pool; advisors
          // adopt them into a classroom only through subject-staff mapping.
          classroomId: null,
          designation: data.designation,
        },
        select: { id: true },
      });

      return { staffId: staff.id, userId: user.id };
    });
  },

  async updateStaffUser(userId: string, data: Pick<UpdateStaffInput, "firstName" | "lastName" | "email" | "departmentId" | "isActive">) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.departmentId !== undefined && { departmentId: data.departmentId }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      select: { id: true },
    });
  },

  async updateStaffProfile(staffId: string, data: Pick<UpdateStaffInput, "designation" | "departmentId">) {
    return prisma.staff.update({
      where: { id: staffId },
      data: {
        ...(data.designation !== undefined && { designation: data.designation }),
        ...(data.departmentId !== undefined && { departmentId: data.departmentId }),
      },
      select: { id: true },
    });
  },

  async countStaffMappings(staffId: string) {
    return prisma.subjectStaff.count({ where: { staffId } });
  },

  async deleteStaffAccount(userId: string) {
    // User deletion cascades to the staff profile row (Staff.user onDelete
    // Cascade); Approval.approverUser references are SetNull, preserving audit.
    await prisma.user.delete({ where: { id: userId }, select: { id: true } });
  },
};
