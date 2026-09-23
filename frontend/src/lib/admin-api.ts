import { apiClient } from "./api";

// ─── Shared Types ──────────────────────────────────────────────────────────────

export type Role = "ADMIN" | "HOD" | "ADVISOR" | "STAFF" | "STUDENT";

export interface SafeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  departmentId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  department?: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  hodUserId: string | null;
  hodUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    isActive: boolean;
  } | null;
  _count?: {
    classrooms: number;
    students: number;
    staff: number;
  };
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  departmentId: string | null;
  department?: {
    id: string;
    code: string;
    name: string;
  } | null;
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
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: PaginationMeta;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  totalDepartments: number;
  departmentsWithHod: number;
  departmentsWithoutHod: number;
  recentActivities: AuditLog[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const res = await apiClient<{ success: boolean; data: DashboardStats }>(
    "/admin/dashboard"
  );
  return res.data;
}

// ─── Departments ──────────────────────────────────────────────────────────────

export async function getAdminDepartments(): Promise<Department[]> {
  const res = await apiClient<{ success: boolean; data: Department[] }>(
    "/admin/departments"
  );
  return res.data;
}

// ─── HOD Management ───────────────────────────────────────────────────────────

export interface GetHodsParams {
  search?: string;
  departmentId?: string;
  isActive?: "true" | "false";
}

export async function getHods(params?: GetHodsParams): Promise<SafeUser[]> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.departmentId) qs.set("departmentId", params.departmentId);
  if (params?.isActive) qs.set("isActive", params.isActive);
  const query = qs.toString();
  const res = await apiClient<{ success: boolean; data: SafeUser[] }>(
    `/admin/hods${query ? `?${query}` : ""}`
  );
  return res.data;
}

export interface CreateHodPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  departmentId: string;
}

export async function createHod(
  payload: CreateHodPayload
): Promise<{ user: SafeUser }> {
  const res = await apiClient<{ success: boolean; data: { user: SafeUser } }>(
    "/admin/hods",
    { method: "POST", data: payload }
  );
  return res.data;
}

export async function updateHodStatus(
  hodId: string,
  isActive: boolean
): Promise<{ user: SafeUser }> {
  const res = await apiClient<{ success: boolean; data: { user: SafeUser } }>(
    `/admin/hods/${hodId}/status`,
    { method: "PATCH", data: { isActive } }
  );
  return res.data;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export interface GetUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: Role;
  departmentId?: string;
  isActive?: "true" | "false";
}

export async function getUsers(
  params?: GetUsersParams
): Promise<PaginatedResponse<SafeUser>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  if (params?.role) qs.set("role", params.role);
  if (params?.departmentId) qs.set("departmentId", params.departmentId);
  if (params?.isActive) qs.set("isActive", params.isActive);
  const query = qs.toString();
  return apiClient<PaginatedResponse<SafeUser>>(
    `/admin/users${query ? `?${query}` : ""}`
  );
}

export interface UpdateAdminUserPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: Role;
  departmentId?: string | null;
  isActive?: boolean;
}

export async function updateAdminUser(
  userId: string,
  payload: UpdateAdminUserPayload
): Promise<{ user: SafeUser }> {
  const res = await apiClient<{ success: boolean; data: { user: SafeUser } }>(
    `/admin/users/${userId}`,
    { method: "PATCH", data: payload }
  );
  return res.data;
}

export async function deleteAdminUser(userId: string): Promise<{ id: string }> {
  const res = await apiClient<{ success: boolean; data: { id: string } }>(
    `/admin/users/${userId}`,
    { method: "DELETE" }
  );
  return res.data;
}

// ─── Staff Management (ADMIN only) ───────────────────────────────────────────
// Staff accounts are created, edited, activated, deactivated, and deleted
// exclusively by the administrator. Advisors only assign existing staff.

export interface AdminStaff {
  id: string;
  employeeCode: string;
  designation: string;
  createdAt: string;
  classroomId: string | null;
  classroom?: { id: string; name: string } | null;
  user: SafeUser;
  _count: { subjectStaff: number };
}

export interface GetAdminStaffParams {
  page?: number;
  limit?: number;
  search?: string;
  departmentId?: string;
  isActive?: "true" | "false";
}

export async function getAdminStaff(
  params?: GetAdminStaffParams
): Promise<PaginatedResponse<AdminStaff>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.search) qs.set("search", params.search);
  if (params?.departmentId) qs.set("departmentId", params.departmentId);
  if (params?.isActive) qs.set("isActive", params.isActive);
  const query = qs.toString();
  return apiClient<PaginatedResponse<AdminStaff>>(
    `/admin/staff${query ? `?${query}` : ""}`
  );
}

export interface CreateStaffPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  employeeCode: string;
  designation: string;
  departmentId: string;
}

export async function createAdminStaff(
  payload: CreateStaffPayload
): Promise<AdminStaff> {
  const res = await apiClient<{ success: boolean; data: AdminStaff }>(
    "/admin/staff",
    { method: "POST", data: payload }
  );
  return res.data;
}

export interface UpdateStaffPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  designation?: string;
  departmentId?: string;
  isActive?: boolean;
}

export async function updateAdminStaff(
  staffId: string,
  payload: UpdateStaffPayload
): Promise<AdminStaff> {
  const res = await apiClient<{ success: boolean; data: AdminStaff }>(
    `/admin/staff/${staffId}`,
    { method: "PATCH", data: payload }
  );
  return res.data;
}

export async function deleteAdminStaff(staffId: string): Promise<{ id: string }> {
  const res = await apiClient<{ success: boolean; data: { id: string } }>(
    `/admin/staff/${staffId}`,
    { method: "DELETE" }
  );
  return res.data;
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export interface GetAuditLogsParams {
  page?: number;
  limit?: number;
  action?: string;
  entityType?: string;
  actorUserId?: string;
  startDate?: string;
  endDate?: string;
}

export async function getAuditLogs(
  params?: GetAuditLogsParams
): Promise<PaginatedResponse<AuditLog>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.action) qs.set("action", params.action);
  if (params?.entityType) qs.set("entityType", params.entityType);
  if (params?.actorUserId) qs.set("actorUserId", params.actorUserId);
  if (params?.startDate) qs.set("startDate", params.startDate);
  if (params?.endDate) qs.set("endDate", params.endDate);
  const query = qs.toString();
  return apiClient<PaginatedResponse<AuditLog>>(
    `/admin/audit-logs${query ? `?${query}` : ""}`
  );
}
