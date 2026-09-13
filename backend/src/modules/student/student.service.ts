import { studentRepository, StudentScope } from "./student.repository";
import { ForbiddenError, NotFoundError } from "../../utils/errors";
import { GetStudentSubjectsQuery } from "./student.schema";

export const studentService = {
  // Every operation derives the student identity from the authenticated
  // session. No endpoint accepts a student ID, so IDOR is structurally
  // impossible; subject IDs are validated against the own classroom.

  async requireScope(userId: string): Promise<StudentScope> {
    const scope = await studentRepository.findStudentScope(userId);
    if (!scope) {
      throw new ForbiddenError("Student profile not found or account inactive.");
    }
    return scope;
  },

  async getDashboard(userId: string) {
    const scope = await this.requireScope(userId);
    return studentRepository.getDashboardData(scope);
  },

  async getProfile(userId: string) {
    const scope = await this.requireScope(userId);
    const profile = await studentRepository.getProfile(scope);
    if (!profile) {
      throw new NotFoundError("Student profile not found.");
    }
    return profile;
  },

  async getSubjects(userId: string, query: GetStudentSubjectsQuery) {
    const scope = await this.requireScope(userId);
    return studentRepository.getSubjects(scope, query);
  },

  async getSubjectById(userId: string, subjectId: string) {
    const scope = await this.requireScope(userId);
    const subject = await studentRepository.findSubjectInScope(subjectId, scope);
    if (subject) return subject;

    const exists = await studentRepository.findSubjectByIdAnywhere(subjectId);
    if (exists) {
      throw new ForbiddenError("This subject is outside your classroom.");
    }
    throw new NotFoundError("Subject not found.");
  },

  async getStatus(userId: string) {
    const scope = await this.requireScope(userId);
    return studentRepository.getStatusSnapshot(scope);
  },
};
