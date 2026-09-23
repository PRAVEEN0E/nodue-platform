import { adminRepository } from "./admin.repository";
import { cacheService } from "../../plugins/redis";
import { auditService } from "../../utils/auditService";
import { hashPassword } from "../../utils/password";
import { ConflictError, NotFoundError, ForbiddenError, ValidationError } from "../../utils/errors";
import {
  CreateHodInput,
  GetUsersQuery,
  GetHodsQuery,
  GetAuditLogsQuery,
  UpdateHodStatusInput,
  CreateStaffInput,
  UpdateStaffInput,
  GetStaffQuery,
  UpdateUserInput,
  bulkImportStudentRowSchema,
  bulkImportStaffRowSchema,
  BulkImportResult,
  BulkRowError,
} from "./admin.schema";
import { parseCsv, csvToObjects } from "../../utils/csvParser";
import { prisma } from "../../plugins/database";

const CACHE_KEYS = {
  dashboard: "cache:admin:dashboard",
  departments: "cache:admin:departments",
  departmentsList: "cache:departments:list", // shared with public endpoint
};

export const adminService = {
  // ─── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboardStats() {
    const cached = await cacheService.get(CACHE_KEYS.dashboard);
    if (cached) return cached;

    const stats = await adminRepository.getDashboardMetrics();
    await cacheService.set(CACHE_KEYS.dashboard, stats, 60); // 60-second TTL
    return stats;
  },

  // ─── Departments ───────────────────────────────────────────────────────────

  async getDepartments() {
    const cached = await cacheService.get(CACHE_KEYS.departments);
    if (cached) return cached;

    const departments = await adminRepository.getDepartmentsWithStats();
    await cacheService.set(CACHE_KEYS.departments, departments, 3600); // 1-hour TTL
    return departments;
  },

  // ─── HOD Management ────────────────────────────────────────────────────────

  async getHods(filters: GetHodsQuery) {
    return adminRepository.getHods(filters);
  },

  async createHod(
    input: CreateHodInput,
    actorUserId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    // 1. Verify department exists
    const department = await adminRepository.findDepartmentById(input.departmentId);
    if (!department) {
      throw new NotFoundError(`Department not found`);
    }

    // 2. Enforce one-HOD-per-department rule at service layer (database constraint is final guard)
    if (department.hodUserId) {
      throw new ConflictError(
        `This department already has an HOD. A department cannot have more than one HOD.`
      );
    }

    // 3. Verify email uniqueness
    const existingUser = await adminRepository.findUserByEmail(input.email);
    if (existingUser) {
      throw new ConflictError(`A user with email '${input.email}' already exists.`);
    }

    // 4. Hash password with Argon2id (never store plaintext)
    const passwordHash = await hashPassword(input.password);

    // 5. Execute atomic transaction: create user + assign department HOD
    let newHod;
    try {
      newHod = await adminRepository.createHodWithDepartmentAssignment({
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        passwordHash,
        departmentId: input.departmentId,
      });
    } catch (err: unknown) {
      // Handle PostgreSQL unique constraint violation (P2002) from the hodUserId unique field
      // This is the race condition safety net — catches concurrent requests that both pass the
      // service-layer check but then race to the DB transaction
      const prismaErr = err as { code?: string; meta?: { target?: string[] }; message?: string };
      if (
        prismaErr.code === "P2002" &&
        prismaErr.meta?.target?.includes("hodUserId")
      ) {
        throw new ConflictError("This department already has an HOD.");
      }
      if (prismaErr.code === "P2002") {
        throw new ConflictError("A user with this email already exists.");
      }
      // PostgreSQL deadlock (40P01): two concurrent transactions deadlocked; the loser should
      // surface as a ConflictError because the winner will have secured the HOD slot
      if (prismaErr.message?.includes("deadlock detected")) {
        throw new ConflictError("This department already has an HOD.");
      }
      throw err;
    }

    // 6. Invalidate all relevant caches
    await Promise.all([
      cacheService.del(CACHE_KEYS.dashboard),
      cacheService.del(CACHE_KEYS.departments),
      cacheService.del(CACHE_KEYS.departmentsList),
    ]);

    // 7. Record audit event (non-blocking)
    await auditService.log({
      actorUserId,
      action: "HOD_CREATED",
      entityType: "User",
      entityId: newHod.id,
      metadata: {
        hodEmail: newHod.email,
        departmentId: input.departmentId,
        departmentCode: department.code,
      },
      ipAddress,
      userAgent,
    });

    return newHod;
  },

  async updateHodStatus(
    hodId: string,
    input: UpdateHodStatusInput,
    actorUserId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    // Will throw Prisma P2025 (not found) if ID doesn't exist or isn't an HOD
    const updatedUser = await adminRepository.updateUserStatus(hodId, input.isActive);

    // Invalidate the specific user's active state from Redis cache (forces re-verification on next request)
    await cacheService.del(`user:active:${hodId}`);
    await cacheService.del(CACHE_KEYS.dashboard);

    const action = input.isActive ? "HOD_ACTIVATED" : "HOD_DEACTIVATED";
    await auditService.log({
      actorUserId,
      action,
      entityType: "User",
      entityId: hodId,
      metadata: { isActive: input.isActive },
      ipAddress,
      userAgent,
    });

    return updatedUser;
  },

  // ─── Users ─────────────────────────────────────────────────────────────────

  async getUsers(query: GetUsersQuery) {
    return adminRepository.getPaginatedUsers(query);
  },

  async updateUser(
    targetUserId: string,
    input: UpdateUserInput,
    actorUserId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const existing = await adminRepository.findUserById(targetUserId);
    if (!existing) {
      throw new NotFoundError("User not found.");
    }

    if (input.email && input.email !== existing.email) {
      const emailTaken = await adminRepository.findUserByEmail(input.email);
      if (emailTaken) {
        throw new ConflictError(`A user with email '${input.email}' already exists.`);
      }
    }

    const updated = await adminRepository.updateUser(targetUserId, input);

    if (input.isActive === false) {
      await cacheService.del(`user:active:${targetUserId}`);
    }

    await auditService.log({
      actorUserId,
      action: "USER_UPDATED",
      entityType: "User",
      entityId: targetUserId,
      metadata: { changes: input },
      ipAddress,
      userAgent,
    });

    return updated;
  },

  async deleteUser(
    targetUserId: string,
    actorUserId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    if (targetUserId === actorUserId) {
      throw new ValidationError("You cannot delete your own admin account.");
    }

    const existing = await adminRepository.findUserById(targetUserId);
    if (!existing) {
      throw new NotFoundError("User not found.");
    }

    const deleted = await adminRepository.deleteUser(targetUserId);
    await cacheService.del(`user:active:${targetUserId}`);

    await auditService.log({
      actorUserId,
      action: "USER_DELETED",
      entityType: "User",
      entityId: targetUserId,
      metadata: { email: existing.email, name: `${existing.firstName} ${existing.lastName}` },
      ipAddress,
      userAgent,
    });

    return deleted;
  },

  // ─── Staff Management (ADMIN-only lifecycle) ────────────────────────────────
  // Staff account CRUD belongs exclusively to Admin. Advisors may only assign
  // existing staff through subject-staff mapping (advisor module). Department
  // changes are limited to unassigned staff to preserve classroom integrity.

  async getStaff(filters: GetStaffQuery) {
    return adminRepository.getStaff(filters);
  },

  async createStaff(
    input: CreateStaffInput,
    actorUserId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const department = await adminRepository.findDepartmentById(input.departmentId);
    if (!department) {
      throw new NotFoundError("Department not found.");
    }

    const [emailTaken, codeTaken] = await Promise.all([
      adminRepository.findUserByEmail(input.email),
      adminRepository.findStaffByEmployeeCode(input.employeeCode),
    ]);
    if (emailTaken) {
      throw new ConflictError(`A user with email '${input.email}' already exists.`);
    }
    if (codeTaken) {
      throw new ConflictError(
        `A staff member with employee code '${input.employeeCode}' already exists.`
      );
    }

    const passwordHash = await hashPassword(input.password);

    let created: { staffId: string; userId: string };
    try {
      created = await adminRepository.createStaffAccount({ ...input, passwordHash });
    } catch (err: unknown) {
      const prismaErr = err as { code?: string };
      if (prismaErr.code === "P2002") {
        throw new ConflictError("A staff member with these unique details already exists.");
      }
      throw err;
    }

    await Promise.all([
      cacheService.del(CACHE_KEYS.dashboard),
      cacheService.del(CACHE_KEYS.departments),
      cacheService.del(CACHE_KEYS.departmentsList),
    ]);

    await auditService.log({
      actorUserId,
      departmentId: input.departmentId,
      action: "STAFF_CREATED",
      entityType: "Staff",
      entityId: created.staffId,
      metadata: { email: input.email, employeeCode: input.employeeCode },
      ipAddress,
      userAgent,
    });

    return adminRepository.findStaffById(created.staffId);
  },

  async updateStaff(
    staffId: string,
    input: UpdateStaffInput,
    actorUserId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const staff = await adminRepository.findStaffById(staffId);
    if (!staff) {
      throw new NotFoundError("Staff member not found.");
    }

    if (input.email && input.email !== staff.user.email) {
      const taken = await adminRepository.findUserByEmail(input.email);
      if (taken) {
        throw new ConflictError(`A user with email '${input.email}' already exists.`);
      }
    }

    if (input.departmentId && input.departmentId !== staff.departmentId) {
      if (staff.classroomId) {
        throw new ForbiddenError(
          "This staff member is assigned to a classroom. Unassign them before changing their department."
        );
      }
    }

    await adminRepository.updateStaffUser(staff.userId, {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      departmentId: input.departmentId,
      isActive: input.isActive,
    });
    await adminRepository.updateStaffProfile(staffId, {
      designation: input.designation,
      departmentId: input.departmentId,
    });

    await Promise.all([
      cacheService.del(CACHE_KEYS.dashboard),
      cacheService.del(CACHE_KEYS.departments),
      cacheService.del(CACHE_KEYS.departmentsList),
    ]);

    const isActiveChanged = input.isActive !== undefined && input.isActive !== staff.user.isActive;
    const action = isActiveChanged
      ? input.isActive
        ? "STAFF_ACTIVATED"
        : "STAFF_DEACTIVATED"
      : "STAFF_UPDATED";
    await auditService.log({
      actorUserId,
      departmentId: staff.departmentId,
      action,
      entityType: "Staff",
      entityId: staffId,
      metadata: {
        ...(input.email !== undefined && { email: input.email }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
      ipAddress,
      userAgent,
    });

    return adminRepository.findStaffById(staffId);
  },

  async deleteStaff(
    staffId: string,
    actorUserId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const staff = await adminRepository.findStaffById(staffId);
    if (!staff) {
      throw new NotFoundError("Staff member not found.");
    }

    const mappings = await adminRepository.countStaffMappings(staffId);
    if (mappings > 0) {
      throw new ConflictError(
        "This staff member has active subject assignments. Remove the assignments before deleting the account."
      );
    }

    await adminRepository.deleteStaffAccount(staff.userId);

    await Promise.all([
      cacheService.del(CACHE_KEYS.dashboard),
      cacheService.del(CACHE_KEYS.departments),
      cacheService.del(CACHE_KEYS.departmentsList),
    ]);

    await auditService.log({
      actorUserId,
      departmentId: staff.departmentId,
      action: "STAFF_DELETED",
      entityType: "Staff",
      entityId: staffId,
      metadata: { email: staff.user.email, employeeCode: staff.employeeCode },
      ipAddress,
      userAgent,
    });

    return { id: staffId };
  },

  // ─── Audit Logs ────────────────────────────────────────────────────────────

  async getAuditLogs(query: GetAuditLogsQuery) {
    return adminRepository.getPaginatedAuditLogs(query);
  },

  // ─── Bulk Import ────────────────────────────────────────────────────────────

  async bulkImportStudents(
    csvText: string,
    actorUserId: string,
    dryRun: boolean,
    ipAddress?: string,
    userAgent?: string
  ): Promise<BulkImportResult> {
    const rows = csvToObjects(parseCsv(csvText));
    const errors: BulkRowError[] = [];
    const validRows: Array<ReturnType<typeof bulkImportStudentRowSchema.parse>> = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // 1-indexed + header row
      const parsed = bulkImportStudentRowSchema.safeParse(rows[i]);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push({ row: rowNum, field: issue.path.join("."), message: issue.message });
        }
      } else {
        validRows.push(parsed.data);
      }
    }

    const result: BulkImportResult = {
      dryRun,
      total: rows.length,
      valid: validRows.length,
      inserted: 0,
      errors,
    };

    if (dryRun || errors.length > 0) return result;

    // Atomic batch insert
    let inserted = 0;
    for (const row of validRows) {
      try {
        const passwordHash = await hashPassword(row.password);
        const email =
          row.email ||
          `${row.registernumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@student.no-due.local`;
        await adminRepository.bulkCreateStudent({
          firstName: row.firstname,
          lastName: row.lastname,
          email,
          passwordHash,
          registerNumber: row.registernumber,
          rollNumber: row.rollnumber || null,
          admissionYear: row.admissionyear,
          classroomId: row.classroomid,
        });
        inserted++;
      } catch {
        // Skip duplicates silently in batch mode
      }
    }

    await auditService.log({
      actorUserId,
      action: "BULK_STUDENT_IMPORT",
      entityType: "Student",
      metadata: { total: rows.length, inserted, dryRun },
      ipAddress,
      userAgent,
    });

    return { ...result, inserted };
  },

  async bulkImportStaff(
    csvText: string,
    actorUserId: string,
    dryRun: boolean,
    ipAddress?: string,
    userAgent?: string
  ): Promise<BulkImportResult> {
    const rows = csvToObjects(parseCsv(csvText));
    const errors: BulkRowError[] = [];

    // ── Step 1: Validate each row schema ────────────────────────────────────
    const parsedRows: Array<ReturnType<typeof bulkImportStaffRowSchema.parse> & { _rowNum: number }> = [];
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const parsed = bulkImportStaffRowSchema.safeParse(rows[i]);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push({ row: rowNum, field: issue.path.join("."), message: issue.message });
        }
      } else {
        parsedRows.push({ ...parsed.data, _rowNum: rowNum });
      }
    }

    // ── Step 2: Resolve department (code / name / UUID) → departmentId ──────
    // Fetch all departments once, then match case-insensitively.
    const allDepts = await prisma.department.findMany({
      select: { id: true, code: true, name: true },
    });

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    type ValidStaffRow = Omit<ReturnType<typeof bulkImportStaffRowSchema.parse>, "department"> & { departmentId: string };
    const validRows: ValidStaffRow[] = [];

    for (const row of parsedRows) {
      const raw = row.department.trim();
      let resolvedId: string | null = null;

      if (UUID_RE.test(raw)) {
        // Treat as literal UUID — verify it exists
        const found = allDepts.find((d) => d.id === raw);
        resolvedId = found ? found.id : null;
      } else {
        // Match against code (exact, case-insensitive) then name (case-insensitive)
        const lower = raw.toLowerCase();
        const byCode = allDepts.find((d) => d.code.toLowerCase() === lower);
        if (byCode) {
          resolvedId = byCode.id;
        } else {
          const byName = allDepts.find((d) => d.name.toLowerCase() === lower);
          resolvedId = byName ? byName.id : null;
        }
      }

      if (!resolvedId) {
        errors.push({
          row: row._rowNum,
          field: "department",
          message: `Unknown department "${raw}". Use a valid department code (e.g. CSE, IT, MECH) or full name.`,
        });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _rowNum, department, ...rest } = row;
        validRows.push({ ...rest, departmentId: resolvedId });
      }
    }

    const result: BulkImportResult = {
      dryRun,
      total: rows.length,
      valid: validRows.length,
      inserted: 0,
      errors,
    };

    if (dryRun || errors.length > 0) return result;

    let inserted = 0;
    for (const row of validRows) {
      try {
        const passwordHash = await hashPassword(row.password);
        const email =
          row.email ||
          `${row.employeecode.toLowerCase().replace(/[^a-z0-9]/g, "")}@staff.no-due.local`;
        await adminRepository.createStaffAccount({
          firstName: row.firstname,
          lastName: row.lastname,
          email,
          password: row.password,
          passwordHash,
          employeeCode: row.employeecode,
          designation: row.designation,
          departmentId: row.departmentId,
          isActive: true,
        });
        inserted++;
      } catch {
        // Skip duplicates silently in batch mode
      }
    }

    await auditService.log({
      actorUserId,
      action: "BULK_STAFF_IMPORT",
      entityType: "Staff",
      metadata: { total: rows.length, inserted, dryRun },
      ipAddress,
      userAgent,
    });

    return { ...result, inserted };
  },
};

