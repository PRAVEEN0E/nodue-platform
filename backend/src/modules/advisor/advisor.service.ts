import { advisorRepository, AdvisorScope } from "./advisor.repository";
import { cacheService } from "../../plugins/redis";
import { auditService } from "../../utils/auditService";
import { hashPassword } from "../../utils/password";
import { invalidateStaffCache } from "../staff/staff.cache";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors";
import { approvalEngine } from "../approval-engine/approval-engine.service";
import { Role } from "@prisma/client";
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
  ApproveFeeVerificationInput,
  GetAdvisorApprovalsQuery,
  DecideAdvisorApprovalInput,
  GetFinalVerificationQuery,
  bulkImportSubjectRowSchema,
  BulkImportSubjectRow,
  bulkImportAdvisorStudentRowSchema,
} from "./advisor.schema";
import { parseCsv, csvToObjects, toCsvString } from "../../utils/csvParser";
import { deriveFinalVerification, StageDecision } from "../approval-engine/approval-engine.service";
import { BulkImportResult, BulkRowError } from "../admin/admin.schema";
import { adminRepository } from "../admin/admin.repository";
import { studentRepository } from "../student/student.repository";

const dashboardCacheKey = (userId: string) => `cache:advisor:dashboard:${userId}`;

async function invalidateAdvisorCache(userId: string): Promise<void> {
  await cacheService.del(dashboardCacheKey(userId));
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === "P2002";
}

export const advisorService = {
  // ─── Scope ────────────────────────────────────────────────────────────────
  // Every resource operation derives classroom + department from the
  // authenticated advisor's own database record. Frontend-supplied IDs are
  // never trusted for authorization.

  async requireScope(userId: string): Promise<AdvisorScope> {
    const scope = await advisorRepository.findAdvisorScope(userId);
    if (!scope) {
      throw new ForbiddenError(
        "Advisor account is not assigned to any classroom. Contact your HOD."
      );
    }
    return scope;
  },

  // ─── Dashboard ────────────────────────────────────────────────────────────

  async getDashboard(userId: string) {
    const cacheKey = dashboardCacheKey(userId);
    const cached = await cacheService.get(cacheKey);
    if (cached) return cached;

    const scope = await this.requireScope(userId);
    const classroom = await advisorRepository.getClassroomDetails(scope.classroomId);
    if (!classroom) {
      throw new NotFoundError("Assigned classroom no longer exists.");
    }
    const data = await advisorRepository.getDashboardData(scope);

    const result = { classroom, ...data };
    await cacheService.set(cacheKey, result, 60);
    return result;
  },

  // ─── Students ─────────────────────────────────────────────────────────────

  async getStudents(userId: string, query: GetStudentsQuery) {
    const scope = await this.requireScope(userId);
    return advisorRepository.getStudents(scope, query);
  },

  async getStudentById(userId: string, studentId: string) {
    const scope = await this.requireScope(userId);
    const student = await advisorRepository.findStudentInScope(studentId, scope.classroomId);
    if (student) return student;

    const elsewhere = await advisorRepository.findStudentByIdAnywhere(studentId);
    if (elsewhere) {
      throw new ForbiddenError("This student belongs to another classroom.");
    }
    throw new NotFoundError("Student not found.");
  },

  async createStudent(
    userId: string,
    input: CreateStudentInput,
    ipAddress?: string,
    userAgent?: string
  ) {
    const scope = await this.requireScope(userId);

    const studentEmail =
      input.email?.trim() ||
      `${input.registerNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@student.institution.edu`;

    const [emailTaken, registerTaken] = await Promise.all([
      advisorRepository.findUserByEmail(studentEmail),
      advisorRepository.findStudentByRegisterNumber(input.registerNumber),
    ]);
    if (emailTaken) {
      throw new ConflictError(`A user with identifier '${input.registerNumber}' already exists.`);
    }
    if (registerTaken) {
      throw new ConflictError(
        `A student with register number '${input.registerNumber}' already exists.`
      );
    }

    const passwordHash = await hashPassword(input.password);

    let created: { userId: string; studentId: string };
    try {
      created = await advisorRepository.createStudent(scope, {
        ...input,
        email: studentEmail,
        passwordHash,
      });
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ConflictError("A user with these unique details already exists.");
      }
      throw err;
    }

    await invalidateAdvisorCache(userId);
    await auditService.log({
      actorUserId: userId,
      departmentId: scope.departmentId,
      action: "STUDENT_CREATED",
      entityType: "Student",
      entityId: created.studentId,
      metadata: { email: input.email, registerNumber: input.registerNumber },
      ipAddress,
      userAgent,
    });

    return advisorRepository.findStudentInScope(created.studentId, scope.classroomId);
  },

  async updateStudent(
    userId: string,
    studentId: string,
    input: UpdateStudentInput,
    ipAddress?: string,
    userAgent?: string
  ) {
    const scope = await this.requireScope(userId);
    const student = await advisorRepository.findStudentInScope(studentId, scope.classroomId);
    if (!student) {
      const elsewhere = await advisorRepository.findStudentByIdAnywhere(studentId);
      if (elsewhere) {
        throw new ForbiddenError("This student belongs to another classroom.");
      }
      throw new NotFoundError("Student not found.");
    }

    if (input.email && input.email !== student.user.email) {
      const taken = await advisorRepository.findUserByEmail(input.email);
      if (taken) {
        throw new ConflictError(`A user with email '${input.email}' already exists.`);
      }
    }

    await advisorRepository.updateStudentUser(student.user.id, {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      isActive: input.isActive,
    });
    await advisorRepository.updateStudentProfile(studentId, {
      rollNumber: input.rollNumber,
      admissionYear: input.admissionYear,
    });

    await invalidateAdvisorCache(userId);
    await auditService.log({
      actorUserId: userId,
      departmentId: scope.departmentId,
      action: "STUDENT_UPDATED",
      entityType: "Student",
      entityId: studentId,
      ipAddress,
      userAgent,
    });

    return advisorRepository.findStudentInScope(studentId, scope.classroomId);
  },

  // ─── Staff (assignment/discovery only; accounts are ADMIN-owned) ─────────

  async getStaff(userId: string, query: GetStaffQuery) {
    const scope = await this.requireScope(userId);
    return advisorRepository.getStaff(scope, query);
  },

  async getAvailableStaff(userId: string, query: GetAvailableStaffQuery) {
    const scope = await this.requireScope(userId);
    return advisorRepository.getAvailableStaff(scope, query);
  },

  async getStaffById(userId: string, staffId: string) {
    const scope = await this.requireScope(userId);
    const staff = await advisorRepository.findStaffInClassroom(
      staffId,
      scope.departmentId,
      scope.classroomId
    );
    if (staff) return staff;

    const elsewhere = await advisorRepository.findStaffByIdAnywhere(staffId);
    if (elsewhere) {
      throw new ForbiddenError("This staff member belongs to another classroom.");
    }
    throw new NotFoundError("Staff not found.");
  },

  // Staff account lifecycle (create/edit/activate/deactivate/delete) is
  // ADMIN-only. Advisors may only assign existing staff to subjects.
  async staffCreateDenied() {
    throw new ForbiddenError(
      "Staff accounts are managed by the administrator. Advisors may only assign existing staff."
    );
  },

  async staffUpdateDenied() {
    throw new ForbiddenError(
      "Staff accounts are managed by the administrator. Advisors may only assign existing staff."
    );
  },

  // ─── Subjects ─────────────────────────────────────────────────────────────

  async getSubjects(userId: string, query: GetSubjectsQuery) {
    const scope = await this.requireScope(userId);
    return advisorRepository.getSubjects(scope, query);
  },

  async getSubjectById(userId: string, subjectId: string) {
    const scope = await this.requireScope(userId);
    const subject = await advisorRepository.findSubjectInScope(subjectId, scope.classroomId);
    if (subject) return subject;

    const elsewhere = await advisorRepository.findSubjectByIdAnywhere(subjectId);
    if (elsewhere) {
      throw new ForbiddenError("This subject belongs to another classroom.");
    }
    throw new NotFoundError("Subject not found.");
  },

  async createSubject(
    userId: string,
    input: CreateSubjectInput,
    ipAddress?: string,
    userAgent?: string
  ) {
    const scope = await this.requireScope(userId);

    const codeTaken = await advisorRepository.findSubjectByCode(input.code);
    if (codeTaken) {
      throw new ConflictError(`A subject with code '${input.code}' already exists.`);
    }

    let created: { id: string };
    try {
      created = await advisorRepository.createSubject(scope, input);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(`A subject with code '${input.code}' already exists.`);
      }
      throw err;
    }

    await invalidateAdvisorCache(userId);
    await auditService.log({
      actorUserId: userId,
      departmentId: scope.departmentId,
      action: "SUBJECT_CREATED",
      entityType: "Subject",
      entityId: created.id,
      metadata: { code: input.code },
      ipAddress,
      userAgent,
    });

    return advisorRepository.findSubjectInScope(created.id, scope.classroomId);
  },

  async updateSubject(
    userId: string,
    subjectId: string,
    input: UpdateSubjectInput,
    ipAddress?: string,
    userAgent?: string
  ) {
    const scope = await this.requireScope(userId);
    const subject = await advisorRepository.findSubjectInScope(subjectId, scope.classroomId);
    if (!subject) {
      const elsewhere = await advisorRepository.findSubjectByIdAnywhere(subjectId);
      if (elsewhere) {
        throw new ForbiddenError("This subject belongs to another classroom.");
      }
      throw new NotFoundError("Subject not found.");
    }

    await advisorRepository.updateSubject(subjectId, input);

    await invalidateAdvisorCache(userId);
    await auditService.log({
      actorUserId: userId,
      departmentId: scope.departmentId,
      action: "SUBJECT_UPDATED",
      entityType: "Subject",
      entityId: subjectId,
      ipAddress,
      userAgent,
    });

    return advisorRepository.findSubjectInScope(subjectId, scope.classroomId);
  },

  // ─── Subject ↔ Staff mapping ──────────────────────────────────────────────

  async getSubjectStaff(userId: string, subjectId: string) {
    const subject = await this.getSubjectById(userId, subjectId);
    return subject.subjectStaff.map((entry) => entry.staff);
  },

  async mapStaffToSubject(
    userId: string,
    subjectId: string,
    staffId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const scope = await this.requireScope(userId);

    const subject = await advisorRepository.findSubjectInScope(subjectId, scope.classroomId);
    if (!subject) {
      const elsewhere = await advisorRepository.findSubjectByIdAnywhere(subjectId);
      if (elsewhere) {
        throw new ForbiddenError("This subject belongs to another classroom.");
      }
      throw new NotFoundError("Subject not found.");
    }

    const staff = await advisorRepository.findStaffForAssignment(staffId);
    if (!staff) {
      throw new NotFoundError("Staff not found.");
    }

    // Inactive staff accounts may not receive new assignments (admin lifecycle).
    if (!staff.user.isActive) {
      throw new ForbiddenError(
        "This staff member is inactive. The administrator must reactivate them before assignment."
      );
    }

    // Teaching scope is derived from the SUBJECT each staff member is mapped
    // to, so an advisor may map any active staff member into their classroom's
    // subjects — regardless of the staff member's home department (staff are
    // college-wide) and even if the staff member is already owned by another
    // classroom (multi-classroom / multi-subject / multi-department teaching).
    // Staff.classroomId is ownership metadata only: it is set once on adoption
    // and controls the advisor's own "My Staff" list, not the staff member's
    // teaching scope.

    const existing = await advisorRepository.findMapping(subjectId, staffId);
    if (existing) {
      throw new ConflictError("This staff member is already assigned to the subject.");
    }

    let mapping: { subjectId: string; staffId: string };
    try {
      mapping = await advisorRepository.createMapping(subjectId, staffId, scope.classroomId);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new ConflictError("This staff member is already assigned to the subject.");
      }
      throw err;
    }

    await invalidateAdvisorCache(userId);
    // The mapped staff member's own dashboard/classes caches must reflect the
    // new subject immediately.
    await invalidateStaffCache(staff.user.id);
    await auditService.log({
      actorUserId: userId,
      departmentId: scope.departmentId,
      action: "SUBJECT_STAFF_MAPPED",
      entityType: "SubjectStaff",
      entityId: `${subjectId}:${staffId}`,
      metadata: { subjectCode: subject.code, staffEmail: staff.user.email },
      ipAddress,
      userAgent,
    });

    return mapping;
  },

  async unmapStaffFromSubject(
    userId: string,
    subjectId: string,
    staffId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const scope = await this.requireScope(userId);

    const subject = await advisorRepository.findSubjectInScope(subjectId, scope.classroomId);
    if (!subject) {
      const elsewhere = await advisorRepository.findSubjectByIdAnywhere(subjectId);
      if (elsewhere) {
        throw new ForbiddenError("This subject belongs to another classroom.");
      }
      throw new NotFoundError("Subject not found.");
    }

    const existing = await advisorRepository.findMapping(subjectId, staffId);
    if (!existing) {
      throw new NotFoundError("This staff assignment does not exist.");
    }

    await advisorRepository.deleteMapping(subjectId, staffId);

    await invalidateAdvisorCache(userId);
    // The unmapped staff member's My Classes / subject lists must update too.
    await invalidateStaffCache(existing.staff.userId);
    await auditService.log({
      actorUserId: userId,
      departmentId: scope.departmentId,
      action: "SUBJECT_STAFF_UNMAPPED",
      entityType: "SubjectStaff",
      entityId: `${subjectId}:${staffId}`,
      ipAddress,
      userAgent,
    });

    return { subjectId, staffId };
  },

  // ─── Fee Verifications ───────────────────────────────────────────────────

  async getFeeVerifications(userId: string, query: GetFeeVerificationsQuery) {
    const scope = await this.requireScope(userId);
    return advisorRepository.getFeeVerifications(scope, query);
  },

  // ─── Final Verification (Phase 7 derived NoDue completion) ────────────────
  // Read-only: effective state is re-derived from the CURRENT approval
  // pipeline against the engine-owned Student.isVerified flag, so no manual
  // final-verification action is introduced. Scope is the authenticated
  // advisor's assigned classroom, resolved server-side.

  async getFinalVerifications(userId: string, query: GetFinalVerificationQuery) {
    const scope = await this.requireScope(userId);
    return advisorRepository.getFinalVerifications(scope, query);
  },

  // ─── Student Clearance Status (advisor view) ──────────────────────────────
  // Returns the full status snapshot for a single student in the advisor's
  // classroom, using the same derivation logic as the student's own status page.

  async getStudentStatus(userId: string, studentId: string) {
    const scope = await this.requireScope(userId);
    // Enforce classroom scope: the student must belong to this advisor's room.
    const student = await advisorRepository.findStudentInScope(studentId, scope.classroomId);
    if (!student) {
      const elsewhere = await advisorRepository.findStudentByIdAnywhere(studentId);
      if (elsewhere) {
        throw new ForbiddenError("This student belongs to another classroom.");
      }
      throw new NotFoundError("Student not found.");
    }
    // Reuse the student repository's snapshot logic.
    return studentRepository.getStatusSnapshot({
      studentId,
      userId: student.user.id,
      classroomId: scope.classroomId,
      departmentId: scope.departmentId,
    });
  },

  // ─── Approvals (Phase 7: advisor stage) ───────────────────────────────────

  async getApprovals(userId: string, query: GetAdvisorApprovalsQuery) {
    const scope = await this.requireScope(userId);

    if (query.status !== "pending") {
      return advisorRepository.getDecidedApprovals(scope.classroomId, {
        page: query.page,
        limit: query.limit,
        search: query.search,
        status: query.status === "decided" ? undefined : query.status.toUpperCase() as "APPROVED" | "REJECTED",
      });
    }

    const candidates = await advisorRepository.getApprovalQueueCandidates(scope.classroomId, query.search);
    const pending = candidates.filter((s) => {
      const subjects = s.classroom.subjects;
      if (subjects.length === 0) return false;
      const allApproved = subjects.every((sub) =>
        sub.approvals.some((a) => a.studentId === s.id && a.status === "APPROVED")
      );
      return allApproved && s.approvals.length === 0;
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
    userId: string,
    input: DecideAdvisorApprovalInput,
    ipAddress?: string,
    userAgent?: string
  ) {
    const scope = await this.requireScope(userId);
    // Engine re-validates scope + state transactionally; the pre-check below
    // produces precise 403/404/409 reasons before attempting the write.
    await approvalEngine.assertAdvisorApprovable(input.studentId, scope.classroomId);
    return approvalEngine.decideStudentApproval({
      studentId: input.studentId,
      role: Role.ADVISOR,
      approverUserId: userId,
      departmentId: scope.departmentId,
      classroomId: scope.classroomId,
      decision: input.decision,
      remarks: input.remarks || null,
      ipAddress,
      userAgent,
    });
  },

  async approveFeeVerification(
    userId: string,
    input: ApproveFeeVerificationInput,
    ipAddress?: string,
    userAgent?: string
  ) {
    const scope = await this.requireScope(userId);
    return approvalEngine.approveFeeVerification({
      studentId: input.studentId,
      role: Role.ADVISOR,
      approverUserId: userId,
      classroomId: scope.classroomId,
      departmentId: scope.departmentId,
      ipAddress,
      userAgent,
    });
  },

  // ─── Bulk Subject Import ──────────────────────────────────────────────────

  async bulkImportSubjects(
    csvText: string,
    userId: string,
    dryRun: boolean,
    ipAddress?: string,
    userAgent?: string
  ): Promise<BulkImportResult> {
    const scope = await this.requireScope(userId);
    const rows = csvToObjects(parseCsv(csvText));
    const errors: BulkRowError[] = [];
    const validRows: BulkImportSubjectRow[] = [];

    const seenCodes = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const parsed = bulkImportSubjectRowSchema.safeParse(rows[i]);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push({ row: rowNum, field: issue.path.join("."), message: issue.message });
        }
      } else {
        const codeUpper = parsed.data.code.toUpperCase();
        if (seenCodes.has(codeUpper)) {
          errors.push({ row: rowNum, field: "code", message: `Duplicate code "${parsed.data.code}" in uploaded CSV.` });
        } else {
          seenCodes.add(codeUpper);
          validRows.push(parsed.data);
        }
      }
    }

    if (validRows.length > 0) {
      const existingCodes = await advisorRepository.findExistingSubjectCodes(validRows.map((r) => r.code));
      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        if (existingCodes.has(row.code.toUpperCase())) {
          errors.push({ row: i + 2, field: "code", message: `Subject code "${row.code}" already exists in database.` });
        }
      }
    }

    const result: BulkImportResult = {
      dryRun,
      total: rows.length,
      valid: Math.max(0, validRows.length - errors.length),
      inserted: 0,
      errors,
    };

    if (dryRun || errors.length > 0) {
      return result;
    }

    const created = await advisorRepository.bulkCreateSubjects(scope, validRows);
    await auditService.log({
      actorUserId: userId,
      action: "BULK_SUBJECT_IMPORT",
      entityType: "Subject",
      departmentId: scope.departmentId,
      metadata: { total: rows.length, inserted: created.length, classroomId: scope.classroomId },
      ipAddress,
      userAgent,
    });

    return { ...result, inserted: created.length };
  },

  // ─── Export Reports ───────────────────────────────────────────────────────

  async exportDefaultersCsv(userId: string): Promise<string> {
    const scope = await this.requireScope(userId);
    const students = await advisorRepository.getClassroomStudentsForReport(scope.classroomId);

    const headers = [
      "Register Number",
      "Student Name",
      "Email",
      "Classroom",
      "Fee Verified",
      "Staff Approvals (Approved/Total)",
      "Advisor Approval",
      "HOD Approval",
      "Defaulter Reasons",
    ];

    const rows: (string | number)[][] = [];

    for (const s of students) {
      const totalSubjects = s.classroom.subjects.length;
      const staffApprovedCount = s.approvals.filter((a) => a.approverRole === Role.STAFF && a.status === "APPROVED").length;
      const staffRejectedCount = s.approvals.filter((a) => a.approverRole === Role.STAFF && a.status === "REJECTED").length;

      const advisorAppr = s.approvals.find((a) => a.approverRole === Role.ADVISOR && !a.subjectId);
      const hodAppr = s.approvals.find((a) => a.approverRole === Role.HOD && !a.subjectId);

      const feeVerified = Boolean(s.feeVerification?.advisorApproved || s.feeVerification?.hodApproved);
      const advisorDecision = (advisorAppr?.status as StageDecision) ?? "PENDING";
      const hodDecision = (hodAppr?.status as StageDecision) ?? "PENDING";

      const fv = deriveFinalVerification({
        subjectsTotal: totalSubjects,
        subjectsApproved: staffApprovedCount,
        subjectsRejected: staffRejectedCount,
        advisorDecision,
        hodDecision,
        feeByAdvisor: s.feeVerification?.advisorApproved ?? false,
        feeByHod: s.feeVerification?.hodApproved ?? false,
        isVerified: true,
      });

      if (!fv.eligible) {
        const reasons: string[] = [];
        if (!feeVerified) reasons.push("Pending Fee Verification");
        if (staffRejectedCount > 0) reasons.push(`${staffRejectedCount} subject(s) rejected by staff`);
        if (staffApprovedCount < totalSubjects) reasons.push(`Staff pending (${staffApprovedCount}/${totalSubjects} approved)`);
        if (advisorDecision !== "APPROVED") reasons.push(`Advisor ${advisorDecision.toLowerCase()}`);
        if (hodDecision !== "APPROVED") reasons.push(`HOD ${hodDecision.toLowerCase()}`);

        rows.push([
          s.registerNumber,
          `${s.user.firstName} ${s.user.lastName}`,
          s.user.email,
          s.classroom.name,
          feeVerified ? "YES" : "NO",
          `${staffApprovedCount}/${totalSubjects}`,
          advisorDecision,
          hodDecision,
          reasons.join("; "),
        ]);
      }
    }

    return toCsvString(headers, rows);
  },

  async exportClearanceSummaryCsv(userId: string): Promise<string> {
    const scope = await this.requireScope(userId);
    const students = await advisorRepository.getClassroomStudentsForReport(scope.classroomId);

    const headers = [
      "Register Number",
      "Student Name",
      "Email",
      "Classroom",
      "Fee Verified",
      "Staff Approvals",
      "Advisor Status",
      "HOD Status",
      "Overall Clearance",
    ];

    const rows: (string | number)[][] = [];

    for (const s of students) {
      const totalSubjects = s.classroom.subjects.length;
      const staffApprovedCount = s.approvals.filter((a) => a.approverRole === Role.STAFF && a.status === "APPROVED").length;
      const staffRejectedCount = s.approvals.filter((a) => a.approverRole === Role.STAFF && a.status === "REJECTED").length;

      const advisorAppr = s.approvals.find((a) => a.approverRole === Role.ADVISOR && !a.subjectId);
      const hodAppr = s.approvals.find((a) => a.approverRole === Role.HOD && !a.subjectId);

      const feeVerified = Boolean(s.feeVerification?.advisorApproved || s.feeVerification?.hodApproved);
      const advisorDecision = (advisorAppr?.status as StageDecision) ?? "PENDING";
      const hodDecision = (hodAppr?.status as StageDecision) ?? "PENDING";

      const fv = deriveFinalVerification({
        subjectsTotal: totalSubjects,
        subjectsApproved: staffApprovedCount,
        subjectsRejected: staffRejectedCount,
        advisorDecision,
        hodDecision,
        feeByAdvisor: s.feeVerification?.advisorApproved ?? false,
        feeByHod: s.feeVerification?.hodApproved ?? false,
        isVerified: true,
      });

      rows.push([
        s.registerNumber,
        `${s.user.firstName} ${s.user.lastName}`,
        s.user.email,
        s.classroom.name,
        feeVerified ? "YES" : "NO",
        `${staffApprovedCount}/${totalSubjects}`,
        advisorDecision,
        hodDecision,
        fv.eligible ? "CLEARED" : "INCOMPLETE",
      ]);
    }

    return toCsvString(headers, rows);
  },

  // ─── Bulk Student Import (Classroom scope) ────────────────────────────────

  async bulkImportStudents(
    csvText: string,
    userId: string,
    dryRun: boolean,
    ipAddress?: string,
    userAgent?: string
  ): Promise<BulkImportResult> {
    const scope = await this.requireScope(userId);
    const rows = csvToObjects(parseCsv(csvText));
    const errors: BulkRowError[] = [];
    const validRows: Array<ReturnType<typeof bulkImportAdvisorStudentRowSchema.parse>> = [];

    const seenRegisters = new Set<string>();
    const seenEmails = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const parsed = bulkImportAdvisorStudentRowSchema.safeParse(rows[i]);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push({ row: rowNum, field: issue.path.join("."), message: issue.message });
        }
      } else {
        const reg = parsed.data.registernumber.toUpperCase();
        const em = (parsed.data.email || `${parsed.data.registernumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@student.institution.edu`).toLowerCase();
        if (seenRegisters.has(reg)) {
          errors.push({ row: rowNum, field: "registerNumber", message: `Duplicate register number "${parsed.data.registernumber}" in CSV.` });
        } else if (seenEmails.has(em)) {
          errors.push({ row: rowNum, field: "email", message: `Duplicate email "${parsed.data.email}" in CSV.` });
        } else {
          seenRegisters.add(reg);
          seenEmails.add(em);
          validRows.push(parsed.data);
        }
      }
    }

    const result: BulkImportResult = {
      dryRun,
      total: rows.length,
      valid: Math.max(0, validRows.length - errors.length),
      inserted: 0,
      errors,
    };

    if (dryRun || errors.length > 0) return result;

    let inserted = 0;
    for (const row of validRows) {
      try {
        const passwordHash = await hashPassword(row.password);
        await adminRepository.bulkCreateStudent({
          firstName: row.firstname,
          lastName: row.lastname,
          email:
            row.email ||
            `${row.registernumber.toLowerCase().replace(/[^a-z0-9]/g, "")}@student.institution.edu`,
          passwordHash,
          registerNumber: row.registernumber,
          rollNumber: row.rollnumber || null,
          admissionYear: row.admissionyear,
          classroomId: scope.classroomId,
        });
        inserted++;
      } catch {
        // Skip duplicate records
      }
    }

    await auditService.log({
      actorUserId: userId,
      action: "BULK_STUDENT_IMPORT",
      entityType: "Student",
      departmentId: scope.departmentId,
      metadata: { total: rows.length, inserted, classroomId: scope.classroomId },
      ipAddress,
      userAgent,
    });

    return { ...result, inserted };
  },
};
