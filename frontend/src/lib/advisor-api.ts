import { apiClient } from "./api";

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

export interface AdvisorClassroom {
  id: string;
  name: string;
  batch: string;
  semester: number;
  section: string;
  department: { id: string; code: string; name: string };
  _count: { students: number; subjects: number };
}

export interface AdvisorDashboardData {
  classroom: AdvisorClassroom;
  counts: { students: number; subjects: number; staff: number; unmappedSubjects: number };
  fees: { verified: number; pending: number };
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
    actorUser: { id: string; firstName: string; lastName: string; role: string } | null;
  }>;
}

export async function getAdvisorDashboard(): Promise<AdvisorDashboardData> {
  const res = await apiClient<{ success: boolean; data: AdvisorDashboardData }>("/advisor/dashboard");
  return res.data;
}

// ─── Students ───────────────────────────────────────────────────────────────

export interface ClearanceStepSummary {
  staff: {
    status: "APPROVED" | "PARTIAL" | "REJECTED" | "PENDING" | "NO_SUBJECTS";
    approved: number;
    total: number;
  };
  advisor: {
    status: "PENDING" | "APPROVED" | "REJECTED";
  };
  hod: {
    status: "PENDING" | "APPROVED" | "REJECTED";
  };
  fee: {
    satisfied: boolean;
  };
  final: {
    state: "NOT_READY" | "READY" | "COMPLETE";
  };
}

export interface AdvisorStudent {
  id: string;
  registerNumber: string;
  rollNumber: string | null;
  admissionYear: number;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    isActive: boolean;
  };
  clearance?: ClearanceStepSummary;
}

export interface AdvisorStudentDetail extends AdvisorStudent {
  classroomId: string;
}

export interface GetAdvisorStudentsParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

export async function getAdvisorStudents(
  params?: GetAdvisorStudentsParams
): Promise<{ data: AdvisorStudent[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  if (params?.isActive !== undefined) qs.set("isActive", String(params.isActive));
  const q = qs.toString();
  const res = await apiClient<{ success: boolean; data: AdvisorStudent[]; meta: PaginationMeta }>(
    `/advisor/students${q ? `?${q}` : ""}`
  );
  return { data: res.data, meta: res.meta };
}

export interface CreateAdvisorStudentPayload {
  firstName: string;
  lastName: string;
  email?: string;
  password: string;
  registerNumber: string;
  rollNumber?: string | null;
  admissionYear: number;
}

export async function createAdvisorStudent(payload: CreateAdvisorStudentPayload) {
  const res = await apiClient<{ success: boolean; data: AdvisorStudentDetail }>("/advisor/students", {
    method: "POST",
    data: payload,
  });
  return res.data;
}

export interface UpdateAdvisorStudentPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  registerNumber?: string;
  rollNumber?: string | null;
  admissionYear?: number;
  isActive?: boolean;
}

export async function updateAdvisorStudent(
  id: string,
  payload: UpdateAdvisorStudentPayload
) {
  const res = await apiClient<{ success: boolean; data: AdvisorStudentDetail }>(`/advisor/students/${id}`, {
    method: "PATCH",
    data: payload,
  });
  return res.data;
}

export async function getAdvisorStudentById(id: string): Promise<AdvisorStudentDetail> {
  const res = await apiClient<{ success: boolean; data: AdvisorStudentDetail }>(`/advisor/students/${id}`);
  return res.data;
}

// ─── Staff (assignment/discovery only; accounts are ADMIN-owned) ──────────

export interface AdvisorStaffSubject {
  id: string;
  code: string;
  name: string;
}

export interface AdvisorStaff {
  id: string;
  employeeCode: string;
  designation: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    isActive: boolean;
  };
  subjectStaff: Array<{ subject: AdvisorStaffSubject }>;
}

export interface GetAdvisorStaffParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

// Assigned staff = classroom membership (adopted by this advisor's classroom).
export async function getAdvisorStaff(
  params?: GetAdvisorStaffParams
): Promise<{ data: AdvisorStaff[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  if (params?.isActive !== undefined) qs.set("isActive", String(params.isActive));
  const q = qs.toString();
  const res = await apiClient<{ success: boolean; data: AdvisorStaff[]; meta: PaginationMeta }>(
    `/advisor/staff${q ? `?${q}` : ""}`
  );
  return { data: res.data, meta: res.meta };
}

// Existing staff eligible for assignment: any active staff member college-wide,
// excluding those already teaching a subject in this advisor's classroom.
// Staff accounts are created by ADMIN only. The list includes the staff
// member's home department for informational display (e.g. when selecting
// cross-department staff).
export interface AdvisorAvailableStaff {
  id: string;
  employeeCode: string;
  designation: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    isActive: boolean;
  };
  department: { id: string; code: string; name: string };
}

export async function getAdvisorStaffAvailable(
  params?: GetAdvisorStaffParams
): Promise<{ data: AdvisorAvailableStaff[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  if (params?.isActive !== undefined) qs.set("isActive", String(params.isActive));
  const q = qs.toString();
  const res = await apiClient<{ success: boolean; data: AdvisorAvailableStaff[]; meta: PaginationMeta }>(
    `/advisor/staff/available${q ? `?${q}` : ""}`
  );
  return { data: res.data, meta: res.meta };
}

// ─── Subjects ───────────────────────────────────────────────────────────────

export interface AdvisorMappedStaff {
  id: string;
  employeeCode: string;
  designation: string;
  user: { id: string; firstName: string; lastName: string; email: string; isActive: boolean };
}

export interface AdvisorSubject {
  id: string;
  code: string;
  name: string;
  credits: number;
  semester: number;
  classroomId: string | null;
  createdAt: string;
  subjectStaff: Array<{ staff: AdvisorMappedStaff }>;
}

export interface GetAdvisorSubjectsParams {
  page?: number;
  limit?: number;
  search?: string;
  semester?: number;
}

export async function getAdvisorSubjects(
  params?: GetAdvisorSubjectsParams
): Promise<{ data: AdvisorSubject[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  if (params?.semester) qs.set("semester", String(params.semester));
  const q = qs.toString();
  const res = await apiClient<{ success: boolean; data: AdvisorSubject[]; meta: PaginationMeta }>(
    `/advisor/subjects${q ? `?${q}` : ""}`
  );
  return { data: res.data, meta: res.meta };
}

export interface CreateAdvisorSubjectPayload {
  code: string;
  name: string;
  credits: number;
  semester: number;
}

export async function createAdvisorSubject(payload: CreateAdvisorSubjectPayload) {
  const res = await apiClient<{ success: boolean; data: AdvisorSubject }>("/advisor/subjects", {
    method: "POST",
    data: payload,
  });
  return res.data;
}

export async function updateAdvisorSubject(
  id: string,
  payload: Partial<Pick<CreateAdvisorSubjectPayload, "name" | "credits" | "semester">>
) {
  const res = await apiClient<{ success: boolean; data: AdvisorSubject }>(`/advisor/subjects/${id}`, {
    method: "PATCH",
    data: payload,
  });
  return res.data;
}

export async function getAdvisorSubjectById(id: string): Promise<AdvisorSubject> {
  const res = await apiClient<{ success: boolean; data: AdvisorSubject }>(`/advisor/subjects/${id}`);
  return res.data;
}

export async function mapStaffToSubject(subjectId: string, staffId: string) {
  const res = await apiClient<{ success: boolean; data: unknown }>(`/advisor/subjects/${subjectId}/staff`, {
    method: "POST",
    data: { staffId },
  });
  return res.data;
}

export async function unmapStaffFromSubject(subjectId: string, staffId: string) {
  const res = await apiClient<{ success: boolean; data: unknown }>(
    `/advisor/subjects/${subjectId}/staff/${staffId}`,
    { method: "DELETE" }
  );
  return res.data;
}

// ─── Fee Verifications ─────────────────────────────────────────────────────

export interface FeeVerificationRow {
  studentId: string;
  studentName: string;
  registerNumber: string;
  verified: boolean;
  advisorApproved: boolean;
  hodApproved: boolean;
}

export interface GetFeeVerificationParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: "PENDING" | "VERIFIED";
}

export async function getFeeVerifications(
  params?: GetFeeVerificationParams
): Promise<{ data: FeeVerificationRow[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  if (params?.status) qs.set("status", params.status);
  const q = qs.toString();
  const res = await apiClient<{ success: boolean; data: FeeVerificationRow[]; meta: PaginationMeta }>(
    `/advisor/fees${q ? `?${q}` : ""}`
  );
  return { data: res.data, meta: res.meta };
}

export interface ApproveFeeVerificationResult {
  studentId: string;
  verified: boolean;
  alreadyVerified: boolean;
}

export async function approveStudentFeeVerification(
  studentId: string
): Promise<ApproveFeeVerificationResult> {
  const res = await apiClient<{ success: boolean; data: ApproveFeeVerificationResult }>(
    "/advisor/fees/approve",
    { method: "POST", data: { studentId } }
  );
  return res.data;
}

// ─── Approvals (Phase 7: advisor stage) ─────────────────────────────────────

export type AdvisorQueueStatus = "pending" | "approved" | "rejected" | "decided";

export interface AdvisorQueueStudent {
  id: string;
  registerNumber: string;
  classroom: { id: string; name: string };
  user: { id: string; firstName: string; lastName: string; email: string; isActive: boolean };
}

export interface AdvisorPendingRow {
  student: AdvisorQueueStudent;
  subjects: Array<{ id: string; code: string; name: string }>;
  status: "PENDING";
}

export interface AdvisorDecidedRow {
  id: string;
  status: "APPROVED" | "REJECTED";
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  student: AdvisorQueueStudent;
}

export async function getAdvisorApprovals(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: AdvisorQueueStatus;
}): Promise<{ data: Array<AdvisorPendingRow | AdvisorDecidedRow>; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  if (params?.status) qs.set("status", params.status);
  const q = qs.toString();
  const res = await apiClient<{
    success: boolean;
    data: Array<AdvisorPendingRow | AdvisorDecidedRow>;
    meta: PaginationMeta;
  }>(`/advisor/approvals${q ? `?${q}` : ""}`);
  return { data: res.data, meta: res.meta };
}

export async function decideAdvisorApproval(payload: {
  studentId: string;
  decision: "APPROVED" | "REJECTED";
  remarks?: string | null;
}) {
  const res = await apiClient<{ success: boolean; data: unknown }>("/advisor/approvals", {
    method: "POST",
    data: payload,
  });
  return res.data;
}

// ─── Final Verification (derived NoDue completion) ──────────────────────────
// Read-only list of students in the advisor's own classroom whose overall
// NoDue process is complete (engine-owned Student.isVerified). No financial
// fields are exposed here.

export interface FinalVerificationRow {
  id: string;
  registerNumber: string;
  rollNumber: string | null;
  admissionYear: number;
  verifiedAt: string | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    isActive: boolean;
  };
}

export interface GetFinalVerificationParams {
  page?: number;
  limit?: number;
  search?: string;
}

export async function getFinalVerifications(
  params?: GetFinalVerificationParams
): Promise<{ data: FinalVerificationRow[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  const q = qs.toString();
  const res = await apiClient<{ success: boolean; data: FinalVerificationRow[]; meta: PaginationMeta }>(
    `/advisor/final-verification${q ? `?${q}` : ""}`
  );
  return { data: res.data, meta: res.meta };
}

// ─── Student Clearance Status (advisor view) ─────────────────────────────────

import type { StudentStatusSnapshot } from "./student-api";

export async function getAdvisorStudentStatus(studentId: string): Promise<StudentStatusSnapshot> {
  const res = await apiClient<{ success: boolean; data: StudentStatusSnapshot }>(
    `/advisor/students/${studentId}/status`
  );
  return res.data;
}

