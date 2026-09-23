import { apiClient } from "./api";

export type Role = "ADMIN" | "HOD" | "ADVISOR" | "STAFF" | "STUDENT";

export interface HodUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
}

export interface DepartmentDetails {
  id: string;
  code: string;
  name: string;
  hodUser: HodUser | null;
  counts: {
    classrooms: number;
    assignedClassrooms: number;
    unassignedClassrooms: number;
    advisors: number;
    students: number;
    staff: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Classroom {
  id: string;
  name: string;
  batch: string;
  semester: number;
  section: string;
  departmentId: string;
  createdAt: string;
  updatedAt: string;
  advisor?: {
    id: string;
    userId: string;
    assignedAt: string;
    user: HodUser;
  } | null;
  _count?: {
    students: number;
  };
}

export interface AdvisorUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  advisorProfile?: {
    id: string;
    classroomId: string | null;
    assignedAt: string;
    classroom?: {
      id: string;
      name: string;
      batch: string;
      semester: number;
      section: string;
    } | null;
  } | null;
}

export interface HodAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actorUser: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: Role;
  } | null;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface HodDashboardData {
  department: DepartmentDetails;
  recentActivity: HodAuditLog[];
}

export interface CreateClassroomPayload {
  name: string;
  batch: string;
  semester: number;
  section: string;
}

export interface UpdateClassroomPayload {
  name?: string;
  batch?: string;
  semester?: number;
  section?: string;
}

export interface CreateAdvisorPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  classroomId?: string | null;
}

export interface UpdateAdvisorPayload {
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function getHodDashboard(): Promise<HodDashboardData> {
  const res = await apiClient<{ success: boolean; data: HodDashboardData }>("/hod/dashboard");
  return res.data;
}

export async function getHodDepartment(): Promise<DepartmentDetails> {
  const res = await apiClient<{ success: boolean; data: DepartmentDetails }>("/hod/department");
  return res.data;
}

export async function updateHodDepartment(name: string): Promise<{ id: string; name: string }> {
  const res = await apiClient<{ success: boolean; data: { id: string; name: string } }>(
    "/hod/department",
    {
      method: "PATCH",
      data: { name },
    }
  );
  return res.data;
}

export async function getHodClassrooms(params?: {
  page?: number;
  limit?: number;
  search?: string;
  semester?: number;
  batch?: string;
  section?: string;
}): Promise<{ data: Classroom[]; meta: PaginationMeta }> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search) query.set("search", params.search);
  if (params?.semester) query.set("semester", String(params.semester));
  if (params?.batch) query.set("batch", params.batch);
  if (params?.section) query.set("section", params.section);

  const qs = query.toString();
  const url = `/hod/classrooms${qs ? `?${qs}` : ""}`;
  const res = await apiClient<{ success: boolean; data: Classroom[]; meta: PaginationMeta }>(url);
  return { data: res.data, meta: res.meta };
}

export async function createClassroom(payload: CreateClassroomPayload): Promise<Classroom> {
  const res = await apiClient<{ success: boolean; data: Classroom }>("/hod/classrooms", {
    method: "POST",
    data: payload,
  });
  return res.data;
}

export async function updateClassroom(
  id: string,
  payload: UpdateClassroomPayload
): Promise<Classroom> {
  const res = await apiClient<{ success: boolean; data: Classroom }>(`/hod/classrooms/${id}`, {
    method: "PATCH",
    data: payload,
  });
  return res.data;
}

export async function getHodAdvisors(params?: {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  classroomId?: string;
}): Promise<{ data: AdvisorUser[]; meta: PaginationMeta }> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search) query.set("search", params.search);
  if (params?.isActive !== undefined) query.set("isActive", String(params.isActive));
  if (params?.classroomId) query.set("classroomId", params.classroomId);

  const qs = query.toString();
  const url = `/hod/advisors${qs ? `?${qs}` : ""}`;
  const res = await apiClient<{ success: boolean; data: AdvisorUser[]; meta: PaginationMeta }>(url);
  return { data: res.data, meta: res.meta };
}

export async function createAdvisor(payload: CreateAdvisorPayload): Promise<AdvisorUser> {
  const res = await apiClient<{ success: boolean; data: AdvisorUser }>("/hod/advisors", {
    method: "POST",
    data: payload,
  });
  return res.data;
}

export async function updateAdvisor(
  id: string,
  payload: UpdateAdvisorPayload
): Promise<AdvisorUser> {
  const res = await apiClient<{ success: boolean; data: AdvisorUser }>(`/hod/advisors/${id}`, {
    method: "PATCH",
    data: payload,
  });
  return res.data;
}

export async function assignAdvisorClassroom(
  advisorId: string,
  classroomId: string | null
): Promise<unknown> {
  const res = await apiClient<{ success: boolean; data: unknown }>(
    `/hod/advisors/${advisorId}/assign-classroom`,
    {
      method: "POST",
      data: { classroomId },
    }
  );
  return res.data;
}

export async function getHodAuditLogs(params?: {
  page?: number;
  limit?: number;
  action?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{ data: HodAuditLog[]; meta: PaginationMeta }> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.action) query.set("action", params.action);
  if (params?.entityType) query.set("entityType", params.entityType);
  if (params?.startDate) query.set("startDate", params.startDate);
  if (params?.endDate) query.set("endDate", params.endDate);

  const qs = query.toString();
  const url = `/hod/audit-logs${qs ? `?${qs}` : ""}`;
  const res = await apiClient<{ success: boolean; data: HodAuditLog[]; meta: PaginationMeta }>(url);
  return { data: res.data, meta: res.meta };
}

// ─── Approvals (Phase 7: HOD stage) ─────────────────────────────────────────

export type HodQueueStatus = "pending" | "approved" | "rejected" | "decided";

export interface HodQueueStudent {
  id: string;
  registerNumber: string;
  classroom: { id: string; name: string };
  user: { id: string; firstName: string; lastName: string; email: string; isActive: boolean };
}

export interface HodPendingRow {
  student: HodQueueStudent;
  subjects: Array<{ id: string; code: string; name: string }>;
  advisorDecision: "APPROVED";
  status: "PENDING";
}

export interface HodDecidedRow {
  id: string;
  status: "APPROVED" | "REJECTED";
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  student: HodQueueStudent;
}

export async function getHodApprovals(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: HodQueueStatus;
}): Promise<{ data: Array<HodPendingRow | HodDecidedRow>; meta: PaginationMeta }> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search) query.set("search", params.search);
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  const url = `/hod/approvals${qs ? `?${qs}` : ""}`;
  const res = await apiClient<{
    success: boolean;
    data: Array<HodPendingRow | HodDecidedRow>;
    meta: PaginationMeta;
  }>(url);
  return { data: res.data, meta: res.meta };
}

export async function decideHodApproval(payload: {
  studentId: string;
  decision: "APPROVED" | "REJECTED";
  remarks?: string | null;
}) {
  const res = await apiClient<{ success: boolean; data: unknown }>("/hod/approvals", {
    method: "POST",
    data: payload,
  });
  return res.data;
}

// ─── Fee Verifications ──────────────────────────────────────────────────────

export interface FeeVerificationRow {
  studentId: string;
  studentName: string;
  registerNumber: string;
  classroomId: string;
  classroomName: string;
  verified: boolean;
  advisorApproved: boolean;
  hodApproved: boolean;
}

export interface GetFeeVerificationParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: "PENDING" | "VERIFIED";
  classroomId?: string;
}

export async function getFeeVerifications(
  params?: GetFeeVerificationParams
): Promise<{ data: FeeVerificationRow[]; meta: PaginationMeta }> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search) query.set("search", params.search);
  if (params?.status) query.set("status", params.status);
  if (params?.classroomId) query.set("classroomId", params.classroomId);
  const qs = query.toString();
  const url = `/hod/fees${qs ? `?${qs}` : ""}`;
  const res = await apiClient<{ success: boolean; data: FeeVerificationRow[]; meta: PaginationMeta }>(url);
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
    "/hod/fees/approve",
    { method: "POST", data: { studentId } }
  );
  return res.data;
}

// ─── Students (department clearance view) ─────────────────────────────────────

export interface HodStudent {
  id: string;
  registerNumber: string;
  rollNumber: string | null;
  admissionYear: number;
  createdAt: string;
  classroom: {
    id: string;
    name: string;
    batch: string;
    semester: number;
    section: string;
  };
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    isActive: boolean;
  };
  clearance?: import("./advisor-api").ClearanceStepSummary;
}

export interface GetHodStudentsParams {
  page?: number;
  limit?: number;
  search?: string;
  classroomId?: string;
}

export async function getHodStudents(
  params?: GetHodStudentsParams
): Promise<{ data: HodStudent[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  if (params?.classroomId) qs.set("classroomId", params.classroomId);
  const q = qs.toString();
  const res = await apiClient<{ success: boolean; data: HodStudent[]; meta: PaginationMeta }>(
    `/hod/students${q ? `?${q}` : ""}`
  );
  return { data: res.data, meta: res.meta };
}

import type { StudentStatusSnapshot } from "./student-api";

export async function getHodStudentStatus(studentId: string): Promise<StudentStatusSnapshot> {
  const res = await apiClient<{ success: boolean; data: StudentStatusSnapshot }>(
    `/hod/students/${studentId}/status`
  );
  return res.data;
}

