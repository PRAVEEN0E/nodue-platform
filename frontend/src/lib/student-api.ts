import { apiClient } from "./api";

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type DecisionStatus = "PENDING" | "APPROVED" | "REJECTED";

// ─── Dashboard ──────────────────────────────────────────────────────────────

export interface StudentDashboardData {
  student: {
    id: string;
    registerNumber: string;
    rollNumber: string | null;
    admissionYear: number;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      isActive: boolean;
    };
    classroom: {
      id: string;
      name: string;
      batch: string;
      semester: number;
      section: string;
      department: { id: string; code: string; name: string };
    };
  } | null;
  subjects: { total: number; approved: number; rejected: number; pending: number };
}

export async function getStudentDashboard(): Promise<StudentDashboardData> {
  const res = await apiClient<{ success: boolean; data: StudentDashboardData }>("/student/dashboard");
  return res.data;
}

// ─── Profile ────────────────────────────────────────────────────────────────

export interface StudentProfile {
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
    isActive: boolean;
  };
  classroom: {
    id: string;
    name: string;
    batch: string;
    semester: number;
    section: string;
    department: { id: string; code: string; name: string };
  };
}

export async function getStudentProfile(): Promise<StudentProfile> {
  const res = await apiClient<{ success: boolean; data: StudentProfile }>("/student/profile");
  return res.data;
}

// ─── Subjects ───────────────────────────────────────────────────────────────

export interface StudentSubject {
  id: string;
  code: string;
  name: string;
  credits: number;
  semester: number;
  subjectStaff: Array<{
    staff: {
      id: string;
      user: { id: string; firstName: string; lastName: string };
    };
  }>;
  approvals: Array<{ id: string; status: DecisionStatus; updatedAt: string }>;
}

export async function getStudentSubjects(params?: {
  page?: number;
  limit?: number;
  search?: string;
  semester?: number;
}): Promise<{ data: StudentSubject[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  if (params?.semester) qs.set("semester", String(params.semester));
  const q = qs.toString();
  const res = await apiClient<{ success: boolean; data: StudentSubject[]; meta: PaginationMeta }>(
    `/student/subjects${q ? `?${q}` : ""}`
  );
  return { data: res.data, meta: res.meta };
}

export interface StudentSubjectDetail extends Omit<StudentSubject, "approvals"> {
  classroom: { id: string; name: string; batch: string; section: string } | null;
  approvals: Array<{
    id: string;
    status: DecisionStatus;
    remarks: string | null;
    updatedAt: string;
  }>;
}

export async function getStudentSubjectById(id: string): Promise<StudentSubjectDetail> {
  const res = await apiClient<{ success: boolean; data: StudentSubjectDetail }>(`/student/subjects/${id}`);
  return res.data;
}

// ─── Status ─────────────────────────────────────────────────────────────────

export interface StudentStatusSnapshot {
  staffStage: {
    total: number;
    decided: number;
    approved: number;
    rejected: number;
    pending: number;
    subjects: Array<{
      id: string;
      code: string;
      name: string;
      staffDecision: DecisionStatus;
      decidedAt: string | null;
    }>;
  };
  advisorStage: { decision: DecisionStatus };
  hodStage: { decision: DecisionStatus };
  feeStage: { satisfied: boolean };
  finalVerification: {
    eligible: boolean;
    state: "NOT_READY" | "READY" | "COMPLETE";
    verified: boolean;
    verifiedAt: string | null;
  };
}

export async function getStudentStatus(): Promise<StudentStatusSnapshot> {
  const res = await apiClient<{ success: boolean; data: StudentStatusSnapshot }>("/student/status");
  return res.data;
}
