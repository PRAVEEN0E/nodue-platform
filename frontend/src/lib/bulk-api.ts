import { apiClient } from "./api";
import { parseCsvText, generatePdfReport } from "./pdf-export";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";

export interface BulkRowError {
  row: number;
  field: string;
  message: string;
}

export interface BulkImportResult {
  dryRun: boolean;
  total: number;
  valid: number;
  inserted: number;
  errors: BulkRowError[];
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

// ─── Student Bulk Import (Admin) ─────────────────────────────────────────────

export async function bulkImportStudents(file: File, dryRun = true): Promise<BulkImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiClient<{ success: boolean; data: BulkImportResult }>(
    `/admin/students/bulk-import?dryRun=${dryRun}`,
    {
      method: "POST",
      body: formData,
    }
  );
  return res.data;
}

export async function downloadStudentTemplate(): Promise<void> {
  const res = await fetch(`${BASE_URL}/admin/students/template`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to download template");
  const blob = await res.blob();
  downloadBlob(blob, "students-template.csv");
}

// ─── Student Bulk Import (Advisor / Classroom Scope) ─────────────────────────

export async function advisorBulkImportStudents(file: File, dryRun = true): Promise<BulkImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiClient<{ success: boolean; data: BulkImportResult }>(
    `/advisor/students/bulk-import?dryRun=${dryRun}`,
    {
      method: "POST",
      body: formData,
    }
  );
  return res.data;
}

export async function advisorDownloadStudentTemplate(): Promise<void> {
  const res = await fetch(`${BASE_URL}/advisor/students/template`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to download template");
  const blob = await res.blob();
  downloadBlob(blob, "classroom-students-template.csv");
}

// ─── Staff Bulk Import (Admin) ───────────────────────────────────────────────

export async function bulkImportStaff(file: File, dryRun = true): Promise<BulkImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiClient<{ success: boolean; data: BulkImportResult }>(
    `/admin/staff/bulk-import?dryRun=${dryRun}`,
    {
      method: "POST",
      body: formData,
    }
  );
  return res.data;
}

export async function downloadStaffTemplate(): Promise<void> {
  const res = await fetch(`${BASE_URL}/admin/staff/template`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to download template");
  const blob = await res.blob();
  downloadBlob(blob, "staff-template.csv");
}

// ─── Subject Bulk Import (Advisor) ───────────────────────────────────────────

export async function bulkImportSubjects(file: File, dryRun = true): Promise<BulkImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await apiClient<{ success: boolean; data: BulkImportResult }>(
    `/advisor/subjects/bulk-import?dryRun=${dryRun}`,
    {
      method: "POST",
      body: formData,
    }
  );
  return res.data;
}

export async function downloadSubjectTemplate(): Promise<void> {
  const res = await fetch(`${BASE_URL}/advisor/subjects/template`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to download template");
  const blob = await res.blob();
  downloadBlob(blob, "subjects-template.csv");
}

// ─── Export Reports ─────────────────────────────────────────────────────────

export async function downloadAdvisorDefaultersReport(): Promise<void> {
  const res = await fetch(`${BASE_URL}/advisor/reports/defaulters/export`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to download defaulters report");
  const blob = await res.blob();
  downloadBlob(blob, `classroom-defaulters-${new Date().toISOString().split("T")[0]}.csv`);
}

export async function downloadAdvisorClearanceReport(): Promise<void> {
  const res = await fetch(`${BASE_URL}/advisor/reports/clearance/export`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to download clearance report");
  const blob = await res.blob();
  downloadBlob(blob, `classroom-clearance-${new Date().toISOString().split("T")[0]}.csv`);
}

export async function downloadHodDefaultersReport(): Promise<void> {
  const res = await fetch(`${BASE_URL}/hod/reports/defaulters/export`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to download defaulters report");
  const blob = await res.blob();
  downloadBlob(blob, `department-defaulters-${new Date().toISOString().split("T")[0]}.csv`);
}

export async function downloadHodClearanceReport(): Promise<void> {
  const res = await fetch(`${BASE_URL}/hod/reports/clearance/export`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to download clearance report");
  const blob = await res.blob();
  downloadBlob(blob, `department-clearance-${new Date().toISOString().split("T")[0]}.csv`);
}

// ─── PDF Export Reports ──────────────────────────────────────────────────────

export async function downloadAdvisorDefaultersPdf(subtitle = "Classroom Report"): Promise<void> {
  const res = await fetch(`${BASE_URL}/advisor/reports/defaulters/export`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch defaulters data");
  const csvText = await res.text();
  const { headers, rows } = parseCsvText(csvText);
  generatePdfReport({
    filename: "classroom-defaulters",
    title: "Classroom Defaulters List",
    subtitle,
    headers,
    rows,
    type: "defaulters",
  });
}

export async function downloadAdvisorClearancePdf(subtitle = "Classroom Report"): Promise<void> {
  const res = await fetch(`${BASE_URL}/advisor/reports/clearance/export`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch clearance data");
  const csvText = await res.text();
  const { headers, rows } = parseCsvText(csvText);
  generatePdfReport({
    filename: "classroom-clearance",
    title: "Classroom Clearance Summary",
    subtitle,
    headers,
    rows,
    type: "clearance",
  });
}

export async function downloadHodDefaultersPdf(subtitle = "Department Report"): Promise<void> {
  const res = await fetch(`${BASE_URL}/hod/reports/defaulters/export`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch defaulters data");
  const csvText = await res.text();
  const { headers, rows } = parseCsvText(csvText);
  generatePdfReport({
    filename: "department-defaulters",
    title: "Department Defaulters List",
    subtitle,
    headers,
    rows,
    type: "defaulters",
  });
}

export async function downloadHodClearancePdf(subtitle = "Department Report"): Promise<void> {
  const res = await fetch(`${BASE_URL}/hod/reports/clearance/export`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch clearance data");
  const csvText = await res.text();
  const { headers, rows } = parseCsvText(csvText);
  generatePdfReport({
    filename: "department-clearance",
    title: "Department Clearance Summary",
    subtitle,
    headers,
    rows,
    type: "clearance",
  });
}

