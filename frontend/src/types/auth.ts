export type Role = "ADMIN" | "HOD" | "ADVISOR" | "STAFF" | "STUDENT";

export interface Department {
  id: string;
  code: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  departmentId?: string | null;
  department?: Department | null;
  createdAt: string;
  advisorProfile?: {
    classroom?: { id: string; name: string; batch: string; section: string };
  } | null;
  studentProfile?: {
    registerNumber: string;
    rollNumber?: string | null;
    admissionYear: number;
    classroom?: { id: string; name: string; batch: string; section: string };
  } | null;
  staffProfile?: {
    employeeCode: string;
    designation: string;
  } | null;
}

export interface AuthResponse {
  success: boolean;
  data?: {
    user: User;
    message?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
