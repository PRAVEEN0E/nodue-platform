import { AuthUserPayload } from "../plugins/auth";
import { ForbiddenError, NotFoundError } from "../utils/errors";
import { prisma } from "../plugins/database";

export interface ResourceScopeContext {
  user: AuthUserPayload;
  departmentId?: string;
  classroomId?: string;
  studentId?: string;
  targetUserId?: string;
}

export const resourceScopeService = {
  /**
   * Enforces department boundary:
   * - ADMIN: Allowed for all departments
   * - HOD / ADVISOR / STAFF: Allowed only if departmentId matches user's department
   * - STUDENT: Allowed only if matches own department
   */
  async enforceDepartmentScope(user: AuthUserPayload, targetDepartmentId: string): Promise<void> {
    if (user.role === "ADMIN") {
      return; // Global access
    }

    if (!user.departmentId || user.departmentId !== targetDepartmentId) {
      throw new ForbiddenError("Access denied: You cannot view or modify resources outside your department.");
    }
  },

  /**
   * Enforces classroom boundary:
   * - ADMIN: Global access
   * - HOD: Allowed if classroom belongs to HOD's department
   * - ADVISOR: Allowed only if assigned to this exact classroom
   * - STUDENT: Allowed only if enrolled in this classroom
   * - STAFF: Allowed if assigned to subjects in this classroom
   */
  async enforceClassroomScope(user: AuthUserPayload, classroomId: string): Promise<void> {
    if (user.role === "ADMIN") {
      return;
    }

    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      include: { advisor: true },
    });

    if (!classroom) {
      throw new NotFoundError("Classroom not found.");
    }

    if (user.role === "HOD") {
      if (user.departmentId !== classroom.departmentId) {
        throw new ForbiddenError("Access denied: Classroom does not belong to your department.");
      }
      return;
    }

    if (user.role === "ADVISOR") {
      if (classroom.advisor?.userId !== user.userId) {
        throw new ForbiddenError("Access denied: You are not the assigned advisor for this classroom.");
      }
      return;
    }

    if (user.role === "STUDENT") {
      const student = await prisma.student.findUnique({
        where: { userId: user.userId },
      });
      if (!student || student.classroomId !== classroomId) {
        throw new ForbiddenError("Access denied: You are not enrolled in this classroom.");
      }
      return;
    }

    throw new ForbiddenError("Access denied to this classroom.");
  },

  /**
   * Enforces user data boundary:
   * - ADMIN: Global access
   * - Any user: Access only their own record
   */
  async enforceUserScope(user: AuthUserPayload, targetUserId: string): Promise<void> {
    if (user.role === "ADMIN") {
      return;
    }

    if (user.userId !== targetUserId) {
      throw new ForbiddenError("Access denied: You cannot access or modify another user's account.");
    }
  },

  /**
   * Enforces student record boundary:
   * - ADMIN: Global access
   * - HOD: If student is in HOD's department
   * - ADVISOR: If student is in Advisor's classroom
   * - STUDENT: If student record belongs to user
   */
  async enforceStudentScope(user: AuthUserPayload, studentId: string): Promise<void> {
    if (user.role === "ADMIN") {
      return;
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { classroom: { include: { advisor: true } } },
    });

    if (!student) {
      throw new NotFoundError("Student not found.");
    }

    if (user.role === "STUDENT") {
      if (student.userId !== user.userId) {
        throw new ForbiddenError("Access denied: You can only view your own student record.");
      }
      return;
    }

    if (user.role === "HOD") {
      if (student.departmentId !== user.departmentId) {
        throw new ForbiddenError("Access denied: Student does not belong to your department.");
      }
      return;
    }

    if (user.role === "ADVISOR") {
      if (student.classroom.advisor?.userId !== user.userId) {
        throw new ForbiddenError("Access denied: Student is not in your assigned classroom.");
      }
      return;
    }

    throw new ForbiddenError("Access denied: Insufficient scope for this student record.");
  },
};
