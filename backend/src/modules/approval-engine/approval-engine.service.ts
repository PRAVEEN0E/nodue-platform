import { prisma } from "../../plugins/database";
import { Prisma, Role, ApprovalStatus } from "@prisma/client";
import { auditService } from "../../utils/auditService";
import { ConflictError, ForbiddenError, NotFoundError } from "../../utils/errors";

export type StageDecision = "PENDING" | "APPROVED" | "REJECTED";
export type ReviewDecision = "APPROVED" | "REJECTED";

// ─── Final verification derivation (single source of truth) ────────────────
// The persisted Student.isVerified flag is AUDIT/history only. The effective
// final state is ALWAYS re-derived from the CURRENT approval pipeline so a
// stale flag can never surface a verified student whose prerequisites are
// incomplete. Every consumer (student status API, advisor final-verification
// queue, dashboard) must use this derivation.
export type FinalVerificationState = "NOT_READY" | "READY" | "COMPLETE";

export interface FinalVerificationDerivation {
  /** All required subjects staff-approved AND advisor AND hod AND fee. */
  eligible: boolean;
  state: FinalVerificationState;
  /** Effective completeness: eligible AND the engine persisted isVerified. */
  complete: boolean;
}

export function deriveFinalVerification(input: {
  subjectsTotal: number;
  subjectsApproved: number;
  subjectsRejected: number;
  advisorDecision: StageDecision;
  hodDecision: StageDecision;
  feeByAdvisor: boolean;
  feeByHod: boolean;
  isVerified: boolean;
}): FinalVerificationDerivation {
  const subjectsComplete =
    input.subjectsTotal > 0 &&
    input.subjectsApproved === input.subjectsTotal &&
    input.subjectsRejected === 0;
  const advisorApproved = input.advisorDecision === "APPROVED";
  const hodApproved = input.hodDecision === "APPROVED";
  const feeVerified = input.feeByAdvisor || input.feeByHod;
  const eligible = subjectsComplete && advisorApproved && hodApproved && feeVerified;
  const complete = eligible && input.isVerified;
  return {
    eligible,
    state: complete ? "COMPLETE" : eligible ? "READY" : "NOT_READY",
    complete,
  };
}

export interface ClearanceStepSummary {
  staff: {
    status: "APPROVED" | "PARTIAL" | "REJECTED" | "PENDING" | "NO_SUBJECTS";
    approved: number;
    total: number;
  };
  advisor: {
    status: StageDecision;
  };
  hod: {
    status: StageDecision;
  };
  fee: {
    satisfied: boolean;
  };
  final: {
    state: FinalVerificationState;
  };
}

export async function batchGetClearanceSummaries(
  students: Array<{ id: string; classroomId: string }>
): Promise<Map<string, ClearanceStepSummary>> {
  const map = new Map<string, ClearanceStepSummary>();
  if (students.length === 0) return map;

  const studentIds = students.map((s) => s.id);
  const classroomIds = [...new Set(students.map((s) => s.classroomId).filter(Boolean))];

  const [subjects, staffApprovals, roleApprovals, feeVerifications, verifications] =
    await Promise.all([
      prisma.subject.findMany({
        where: { classroomId: { in: classroomIds } },
        select: { id: true, classroomId: true },
      }),
      prisma.approval.findMany({
        where: {
          studentId: { in: studentIds },
          approverRole: Role.STAFF,
          subjectId: { not: null },
        },
        select: { studentId: true, subjectId: true, status: true },
      }),
      prisma.approval.findMany({
        where: {
          studentId: { in: studentIds },
          subjectId: null,
          approverRole: { in: [Role.ADVISOR, Role.HOD] },
        },
        select: { studentId: true, approverRole: true, status: true },
      }),
      prisma.feeVerification.findMany({
        where: { studentId: { in: studentIds } },
        select: { studentId: true, advisorApproved: true, hodApproved: true },
      }),
      prisma.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, isVerified: true },
      }),
    ]);

  const classroomSubjectIds = new Map<string, string[]>();
  for (const s of subjects) {
    if (!s.classroomId) continue;
    const list = classroomSubjectIds.get(s.classroomId) ?? [];
    list.push(s.id);
    classroomSubjectIds.set(s.classroomId, list);
  }

  const staffByStudent = new Map<string, Map<string, ApprovalStatus>>();
  for (const a of staffApprovals) {
    if (!a.subjectId) continue;
    let studentMap = staffByStudent.get(a.studentId);
    if (!studentMap) {
      studentMap = new Map();
      staffByStudent.set(a.studentId, studentMap);
    }
    studentMap.set(a.subjectId, a.status);
  }

  const roleByStudent = new Map<string, Map<Role, ApprovalStatus>>();
  for (const a of roleApprovals) {
    let studentMap = roleByStudent.get(a.studentId);
    if (!studentMap) {
      studentMap = new Map();
      roleByStudent.set(a.studentId, studentMap);
    }
    studentMap.set(a.approverRole, a.status);
  }

  const feeByStudent = new Map<string, { advisorApproved: boolean; hodApproved: boolean }>();
  for (const f of feeVerifications) {
    feeByStudent.set(f.studentId, {
      advisorApproved: f.advisorApproved,
      hodApproved: f.hodApproved,
    });
  }

  const isVerifiedByStudent = new Map<string, boolean>();
  for (const v of verifications) {
    isVerifiedByStudent.set(v.id, v.isVerified);
  }

  for (const s of students) {
    const subIds = classroomSubjectIds.get(s.classroomId) ?? [];
    const staffMap = staffByStudent.get(s.id);
    let approved = 0;
    let rejected = 0;
    for (const subId of subIds) {
      const decision = staffMap?.get(subId);
      if (decision === "APPROVED") approved++;
      else if (decision === "REJECTED") rejected++;
    }

    const total = subIds.length;
    const staffStatus =
      total === 0
        ? "NO_SUBJECTS"
        : approved === total
        ? "APPROVED"
        : rejected > 0
        ? "REJECTED"
        : approved > 0
        ? "PARTIAL"
        : "PENDING";

    const roleMap = roleByStudent.get(s.id);
    const advisorStatus = (roleMap?.get(Role.ADVISOR) as StageDecision) ?? "PENDING";
    const hodStatus = (roleMap?.get(Role.HOD) as StageDecision) ?? "PENDING";

    const feeObj = feeByStudent.get(s.id);
    const feeSatisfied = Boolean(feeObj?.advisorApproved || feeObj?.hodApproved);

    const isVerified = isVerifiedByStudent.get(s.id) ?? false;
    const fv = deriveFinalVerification({
      subjectsTotal: total,
      subjectsApproved: approved,
      subjectsRejected: rejected,
      advisorDecision: advisorStatus,
      hodDecision: hodStatus,
      feeByAdvisor: Boolean(feeObj?.advisorApproved),
      feeByHod: Boolean(feeObj?.hodApproved),
      isVerified,
    });

    map.set(s.id, {
      staff: { status: staffStatus, approved, total },
      advisor: { status: advisorStatus },
      hod: { status: hodStatus },
      fee: { satisfied: feeSatisfied },
      final: { state: fv.state },
    });
  }

  return map;
}

export interface VerificationState {
  studentId: string;
  subjects: {
    total: number;
    approved: number;
    rejected: number;
    pending: number;
    items: Array<{
      subjectId: string;
      code: string;
      name: string;
      decision: StageDecision;
    }>;
  };
  advisor: { decision: StageDecision };
  hod: { decision: StageDecision };
  fee: { satisfied: boolean; byAdvisor: boolean; byHod: boolean };
  /** Effective completeness (eligible AND engine-persisted isVerified). */
  finalVerified: boolean;
  finalVerification: FinalVerificationDerivation & { verifiedAt: Date | null };
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === "P2002";
}

async function logDecision(input: {
  actorUserId: string;
  departmentId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await auditService.log({
    actorUserId: input.actorUserId,
    departmentId: input.departmentId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
}

export const approvalEngine = {
  // ─── Derived state (single source of truth for every consumer) ───────────

  async getVerificationState(studentId: string): Promise<VerificationState> {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        isVerified: true,
        verifiedAt: true,
        classroomId: true,
        classroom: {
          select: {
            subjects: {
              select: {
                id: true,
                code: true,
                name: true,
                approvals: {
                  where: { studentId, approverRole: Role.STAFF },
                  select: { status: true },
                },
              },
              orderBy: { code: "asc" },
            },
          },
        },
        approvals: {
          where: { subjectId: null, approverRole: { in: [Role.ADVISOR, Role.HOD] } },
          select: { approverRole: true, status: true },
        },
        feeVerification: {
          select: { advisorApproved: true, hodApproved: true },
        },
      },
    });

    if (!student) {
      throw new NotFoundError("Student not found.");
    }

    let approved = 0;
    let rejected = 0;
    const items = student.classroom.subjects.map((s) => {
      const decision = (s.approvals[0]?.status ?? "PENDING") as StageDecision;
      if (decision === "APPROVED") approved++;
      else if (decision === "REJECTED") rejected++;
      return { subjectId: s.id, code: s.code, name: s.name, decision };
    });

    const advisorRow = student.approvals.find((a) => a.approverRole === Role.ADVISOR);
    const hodRow = student.approvals.find((a) => a.approverRole === Role.HOD);
    const advisor = (advisorRow?.status ?? "PENDING") as StageDecision;
    const hod = (hodRow?.status ?? "PENDING") as StageDecision;

    const byAdvisor = student.feeVerification?.advisorApproved ?? false;
    const byHod = student.feeVerification?.hodApproved ?? false;

    const finalVerification = deriveFinalVerification({
      subjectsTotal: items.length,
      subjectsApproved: approved,
      subjectsRejected: rejected,
      advisorDecision: advisor,
      hodDecision: hod,
      feeByAdvisor: byAdvisor,
      feeByHod: byHod,
      isVerified: student.isVerified,
    });

    return {
      studentId: student.id,
      subjects: {
        total: items.length,
        approved,
        rejected,
        pending: items.length - approved - rejected,
        items,
      },
      advisor: { decision: advisor },
      hod: { decision: hod },
      fee: { satisfied: byAdvisor || byHod, byAdvisor, byHod },
      finalVerified: finalVerification.complete,
      finalVerification: {
        ...finalVerification,
        verifiedAt: finalVerification.complete ? student.verifiedAt : null,
      },
    };
  },

  // ─── Guards (throw 403/404/409 with precise reasons) ─────────────────────

  async assertAdvisorApprovable(studentId: string, classroomId: string) {
    const student = await prisma.student.findFirst({
      where: { id: studentId, classroomId },
      select: { id: true },
    });
    if (!student) {
      const exists = await prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true },
      });
      if (exists) {
        throw new ForbiddenError("This student belongs to another classroom.");
      }
      throw new NotFoundError("Student not found.");
    }

    const state = await this.getVerificationState(studentId);
    if (state.subjects.total === 0) {
      throw new ConflictError("Student has no subjects to review.");
    }
    if (state.subjects.rejected > 0) {
      throw new ConflictError("Advisor review is blocked: one or more subjects are staff-rejected.");
    }
    if (state.subjects.pending > 0) {
      throw new ConflictError("Advisor review is blocked: not all subjects are staff-approved.");
    }
    const existing = await prisma.approval.findFirst({
      where: { studentId: studentId, subjectId: null, approverRole: Role.ADVISOR },
      select: { id: true, status: true },
    });
    return { state, existing };
  },

  async assertHodApprovable(studentId: string, departmentId: string) {
    const student = await prisma.student.findFirst({
      where: { id: studentId, departmentId },
      select: { id: true },
    });
    if (!student) {
      const exists = await prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true },
      });
      if (exists) {
        throw new ForbiddenError("This student belongs to another department.");
      }
      throw new NotFoundError("Student not found.");
    }

    const state = await this.getVerificationState(studentId);
    if (state.subjects.total === 0) {
      throw new ConflictError("Student has no subjects to review.");
    }
    if (state.subjects.rejected > 0 || state.subjects.pending > 0) {
      throw new ConflictError("HOD review is blocked: staff approval is incomplete.");
    }
    if (state.advisor.decision !== "APPROVED") {
      throw new ConflictError("HOD review is blocked: advisor approval is pending.");
    }
    const existing = await prisma.approval.findFirst({
      where: { studentId: studentId, subjectId: null, approverRole: Role.HOD },
      select: { id: true, status: true },
    });
    return { state, existing };
  },

  // ─── Role-level decisions (transactional, idempotent, immutable) ─────────

  async decideStudentApproval(input: {
    studentId: string;
    role: Role;
    approverUserId: string;
    departmentId?: string | null;
    classroomId?: string | null;
    decision: ReviewDecision;
    remarks: string | null;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return prisma.$transaction(async (tx) => {
      // Re-validate scope + state inside the transaction.
      let studentOk = false;
      if (input.role === Role.ADVISOR && input.classroomId) {
        const s = await tx.student.findFirst({
          where: { id: input.studentId, classroomId: input.classroomId },
          select: { id: true },
        });
        studentOk = !!s;
      } else if (input.role === Role.HOD && input.departmentId) {
        const s = await tx.student.findFirst({
          where: { id: input.studentId, departmentId: input.departmentId },
          select: { id: true },
        });
        studentOk = !!s;
      }
      if (!studentOk) {
        throw new ForbiddenError("Student is outside your authorized scope.");
      }

      const existing = await tx.approval.findFirst({
        where: { studentId: input.studentId, subjectId: null, approverRole: input.role },
        select: { id: true, status: true },
      });
      if (existing) {
        if (existing.status === input.decision) {
          return { id: existing.id, status: existing.status, idempotent: true as const };
        }
        throw new ConflictError(`A ${existing.status} decision is already recorded.`);
      }

      let created;
      try {
        created = await tx.approval.create({
          data: {
            studentId: input.studentId,
            subjectId: null,
            approverRole: input.role,
            approverUserId: input.approverUserId,
            status: input.decision as ApprovalStatus,
            remarks: input.remarks,
          },
          select: { id: true, status: true },
        });
      } catch (err: unknown) {
        if (isUniqueViolation(err)) {
          // The transaction is dead after the constraint violation, so the
          // re-read must use a fresh client. The winner has committed by the
          // time Postgres releases the loser, making this read exact.
          const raced = await prisma.approval.findFirst({
            where: { studentId: input.studentId, subjectId: null, approverRole: input.role },
            select: { id: true, status: true },
          });
          if (raced && raced.status === input.decision) {
            return { id: raced.id, status: raced.status, idempotent: true as const };
          }
          throw new ConflictError("A decision is already recorded for this student.");
        }
        throw err;
      }

      await logDecision({
        actorUserId: input.approverUserId,
        departmentId: input.departmentId,
        action: input.role === Role.ADVISOR
          ? input.decision === "APPROVED" ? "ADVISOR_APPROVED" : "ADVISOR_REJECTED"
          : input.decision === "APPROVED" ? "HOD_APPROVED" : "HOD_REJECTED",
        entityType: "Approval",
        entityId: created.id,
        metadata: { studentId: input.studentId, decision: input.decision, role: input.role },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });

      // Recompute final verification inside the same transaction.
      await this.tryFinalizeTx(tx, input.studentId, input.approverUserId, input.departmentId, input.ipAddress, input.userAgent);

      return { id: created.id, status: created.status, idempotent: false as const };
    });
  },

  // --- Fee verification for a student (OR rule, atomic) ----------------------
  // Exactly one FeeVerification row per student. VERIFIED iff advisorApproved
  // OR hodApproved. Idempotent: repeats and cross-role second approvals
  // safely return the current VERIFIED state without new rows.

  async approveFeeVerification(input: {
    studentId: string;
    role: Role;
    approverUserId: string;
    classroomId?: string | null;
    departmentId?: string | null;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ studentId: string; verified: boolean; alreadyVerified: boolean }> {
    return prisma.$transaction(async (tx) => {
      const student = await tx.student.findUnique({
        where: { id: input.studentId },
        select: { id: true, classroomId: true, departmentId: true, registerNumber: true },
      });
      if (!student) {
        throw new NotFoundError("Student not found.");
      }
      if (input.role === Role.ADVISOR) {
        if (!input.classroomId || student.classroomId !== input.classroomId) {
          throw new ForbiddenError("This student is outside your classroom.");
        }
      } else {
        if (!input.departmentId || student.departmentId !== input.departmentId) {
          throw new ForbiddenError("This student is outside your department.");
        }
      }

      const existing = await tx.feeVerification.findUnique({
        where: { studentId: input.studentId },
      });
      if (existing && (existing.advisorApproved || existing.hodApproved)) {
        const alreadyMarked =
          input.role === Role.ADVISOR ? existing.advisorApproved : existing.hodApproved;
        if (alreadyMarked) {
          return { studentId: input.studentId, verified: true, alreadyVerified: true };
        }
        // Cross-role confirmation: record the confirming approver's independent
        // check (flag + audit) while leaving the existing VERIFIED state intact.
        const flag =
          input.role === Role.ADVISOR ? { advisorApproved: true } : { hodApproved: true };
        const by =
          input.role === Role.ADVISOR
            ? { advisorById: input.approverUserId }
            : { hodById: input.approverUserId };
        await tx.feeVerification.update({
          where: { studentId: input.studentId },
          data: { ...flag, ...by },
        });
        await logDecision({
          actorUserId: input.approverUserId,
          departmentId: input.departmentId ?? null,
          action: "FEE_APPROVED",
          entityType: "FeeVerification",
          entityId: input.studentId,
          metadata: {
            studentId: input.studentId,
            registerNumber: student.registerNumber,
            actorRole: input.role,
          },
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        });
        return { studentId: input.studentId, verified: true, alreadyVerified: true };
      }

      const flag =
        input.role === Role.ADVISOR ? { advisorApproved: true } : { hodApproved: true };
      const by =
        input.role === Role.ADVISOR
          ? { advisorById: input.approverUserId }
          : { hodById: input.approverUserId };
      await tx.feeVerification.upsert({
        where: { studentId: input.studentId },
        update: { ...flag, ...by },
        create: { studentId: input.studentId, ...flag, ...by },
      });

      await logDecision({
        actorUserId: input.approverUserId,
        departmentId: input.departmentId ?? null,
        action: "FEE_APPROVED",
        entityType: "FeeVerification",
        entityId: input.studentId,
        metadata: {
          studentId: input.studentId,
          registerNumber: student.registerNumber,
          actorRole: input.role,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });

      await this.tryFinalizeTx(tx, input.studentId, input.approverUserId, input.departmentId, input.ipAddress, input.userAgent);

      return { studentId: input.studentId, verified: true, alreadyVerified: false };
    });
  },

  async getFeeVerification(studentId: string): Promise<{
    verified: boolean;
    byAdvisor: boolean;
    byHod: boolean;
  }> {
    const row = await prisma.feeVerification.findUnique({
      where: { studentId },
      select: { advisorApproved: true, hodApproved: true },
    });
    if (!row) return { verified: false, byAdvisor: false, byHod: false };
    return {
      verified: row.advisorApproved || row.hodApproved,
      byAdvisor: row.advisorApproved,
      byHod: row.hodApproved,
    };
  },


  // ─── Final verification (derived; monotonic; engine-owned) ───────────────

  async tryFinalizeTx(
    tx: Prisma.TransactionClient,
    studentId: string,
    actorUserId: string,
    departmentId?: string | null,
    ipAddress?: string,
    userAgent?: string
  ): Promise<boolean> {
    const student = await tx.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        isVerified: true,
        classroom: {
          select: {
            subjects: {
              select: {
                id: true,
                approvals: {
                  where: { studentId, approverRole: Role.STAFF },
                  select: { status: true },
                },
              },
            },
          },
        },
        approvals: {
          where: { subjectId: null, approverRole: { in: [Role.ADVISOR, Role.HOD] } },
          select: { approverRole: true, status: true },
        },
        feeVerification: {
          select: { advisorApproved: true, hodApproved: true },
        },
      },
    });
    if (!student || student.isVerified) return student?.isVerified ?? false;

    const subjects = student.classroom.subjects;
    const allStaffApproved =
      subjects.length > 0 &&
      subjects.every((s) => s.approvals[0]?.status === "APPROVED");
    const advisorApproved = student.approvals.some(
      (a) => a.approverRole === Role.ADVISOR && a.status === "APPROVED"
    );
    const hodApproved = student.approvals.some(
      (a) => a.approverRole === Role.HOD && a.status === "APPROVED"
    );
    const feeSatisfied =
      (student.feeVerification?.advisorApproved ?? false) ||
      (student.feeVerification?.hodApproved ?? false);

    if (!(allStaffApproved && advisorApproved && hodApproved && feeSatisfied)) {
      return false;
    }

    await tx.student.update({
      where: { id: studentId },
      data: { isVerified: true, verifiedAt: new Date() },
    });
    await logDecision({
      actorUserId,
      departmentId,
      action: "FINAL_VERIFIED",
      entityType: "Student",
      entityId: studentId,
      ipAddress,
      userAgent,
    });
    return true;
  },
};
