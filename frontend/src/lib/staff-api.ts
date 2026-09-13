import { apiClient } from "./api";

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type DecisionStatus = "PENDING" | "APPROVED" | "REJECTED";

// ─── Dashboard ──────────────────────────────────────────────────────────────

export interface StaffDashboardData {
  counts: { subjects: number; students: number; pending: number; approved: number; rejected: number };
  recentDecisions: Array<{
    id: string;
    status: DecisionStatus;
    updatedAt: string;
    student: {
      registerNumber: string;
      user: { firstName: string; lastName: string };
    };
    subject: { id: string; code: string; name: string } | null;
  }>;
}

export async function getStaffDashboard(): Promise<StaffDashboardData> {
  const res = await apiClient<{ success: boolean; data: StaffDashboardData }>("/staff/dashboard");
  return res.data;
}

// ─── My Classes (assigned classrooms) ──────────────────────────────────────

export interface StaffClass {
  id: string;
  name: string;
  batch: string;
  semester: number;
  section: string;
  department: { id: string; code: string; name: string };
  studentCount: number;
  subjectCount: number;
  pendingCount: number;
}

export interface StaffClassSubject {
  id: string;
  code: string;
  name: string;
  credits: number;
  semester: number;
  studentCount: number;
  pendingCount: number;
}

export interface StaffClassDetail {
  id: string;
  name: string;
  batch: string;
  semester: number;
  section: string;
  department: { id: string; code: string; name: string };
  studentCount: number;
  subjects: StaffClassSubject[];
}

export async function getStaffClasses(): Promise<{ data: StaffClass[]; meta: PaginationMeta }> {
  const res = await apiClient<{ success: boolean; data: StaffClass[]; meta: PaginationMeta }>(
    "/staff/classes"
  );
  return { data: res.data, meta: res.meta };
}

export async function getStaffClassById(id: string): Promise<StaffClassDetail> {
  const res = await apiClient<{ success: boolean; data: StaffClassDetail }>(`/staff/classes/${id}`);
  return res.data;
}

// ─── Subjects ───────────────────────────────────────────────────────────────

export interface StaffSubject {
  id: string;
  code: string;
  name: string;
  credits: number;
  semester: number;
  classroom: {
    id: string;
    name: string;
    batch: string;
    section: string;
    _count: { students: number };
  } | null;
  _count: { approvals: number };
}

export interface StaffSubjectStudent {
  id: string;
  registerNumber: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    isActive: boolean;
  };
  approvals: Array<{ id: string; status: DecisionStatus; updatedAt: string }>;
}

export interface StaffSubjectDetail extends Omit<StaffSubject, "classroom" | "_count"> {
  classroom: {
    id: string;
    name: string;
    batch: string;
    semester: number;
    section: string;
    department: { id: string; code: string; name: string };
  } | null;
  subjectStaff: Array<{
    staff: {
      id: string;
      employeeCode: string;
      user: { id: string; firstName: string; lastName: string; email: string };
    };
  }>;
  students: StaffSubjectStudent[];
}

export async function getStaffSubjects(params?: {
  page?: number;
  limit?: number;
  search?: string;
  semester?: number;
}): Promise<{ data: StaffSubject[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  if (params?.semester) qs.set("semester", String(params.semester));
  const q = qs.toString();
  const res = await apiClient<{ success: boolean; data: StaffSubject[]; meta: PaginationMeta }>(
    `/staff/subjects${q ? `?${q}` : ""}`
  );
  return { data: res.data, meta: res.meta };
}

export async function getStaffSubjectById(id: string): Promise<StaffSubjectDetail> {
  const res = await apiClient<{ success: boolean; data: StaffSubjectDetail }>(`/staff/subjects/${id}`);
  return res.data;
}

// ─── Students ───────────────────────────────────────────────────────────────

export interface StaffStudent {
  id: string;
  registerNumber: string;
  classroom: { id: string; name: string; batch: string; section: string };
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    isActive: boolean;
  };
  approvals: Array<{ subjectId: string; status: DecisionStatus }>;
  staffDecisions: { decided: number; total: number };
}

export interface StaffStudentDetail {
  id: string;
  registerNumber: string;
  rollNumber: string | null;
  admissionYear: number;
  classroom: {
    id: string;
    name: string;
    batch: string;
    section: string;
    semester: number;
    department: { id: string; code: string; name: string };
  };
  user: StaffStudent["user"];
  approvals: Array<{
    id: string;
    status: DecisionStatus;
    remarks: string | null;
    updatedAt: string;
    subject: { id: string; code: string; name: string } | null;
  }>;
}

export async function getStaffStudents(params?: {
  page?: number;
  limit?: number;
  search?: string;
  subjectId?: string;
}): Promise<{ data: StaffStudent[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  if (params?.subjectId) qs.set("subjectId", params.subjectId);
  const q = qs.toString();
  const res = await apiClient<{ success: boolean; data: StaffStudent[]; meta: PaginationMeta }>(
    `/staff/students${q ? `?${q}` : ""}`
  );
  return { data: res.data, meta: res.meta };
}

export async function getStaffStudentById(id: string): Promise<StaffStudentDetail> {
  const res = await apiClient<{ success: boolean; data: StaffStudentDetail }>(`/staff/students/${id}`);
  return res.data;
}

// ─── Approvals ──────────────────────────────────────────────────────────────

export interface ApprovalPairStudent {
  id: string;
  registerNumber: string;
  classroom: { id: string; name: string };
  user: { id: string; firstName: string; lastName: string; email: string };
}

export interface ApprovalPairSubject {
  id: string;
  code: string;
  name: string;
}

export interface PendingPair {
  student: ApprovalPairStudent;
  subject: ApprovalPairSubject;
  status: "PENDING";
}

export interface DecidedApproval {
  id: string;
  status: Exclude<DecisionStatus, "PENDING">;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  student: ApprovalPairStudent;
  subject: ApprovalPairSubject | null;
}

export async function getStaffApprovals(params?: {
  page?: number;
  limit?: number;
  search?: string;
  subjectId?: string;
  status?: "pending" | "approved" | "rejected" | "decided";
}): Promise<{ data: Array<PendingPair | DecidedApproval>; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  if (params?.subjectId) qs.set("subjectId", params.subjectId);
  if (params?.status) qs.set("status", params.status);
  const q = qs.toString();
  const res = await apiClient<{
    success: boolean;
    data: Array<PendingPair | DecidedApproval>;
    meta: PaginationMeta;
  }>(`/staff/approvals${q ? `?${q}` : ""}`);
  return { data: res.data, meta: res.meta };
}

export async function decideApproval(payload: {
  studentId: string;
  subjectId: string;
  decision: "APPROVED" | "REJECTED";
  remarks?: string | null;
}) {
  const res = await apiClient<{ success: boolean; data: unknown }>("/staff/approvals", {
    method: "POST",
    data: payload,
  });
  return res.data;
}
