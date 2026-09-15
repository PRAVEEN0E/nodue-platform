"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  getUsers,
  getAdminDepartments,
  SafeUser,
  Department,
} from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { UploadCloud, Search, GraduationCap } from "lucide-react";
import { BulkImportModal } from "@/components/ui/BulkImportModal";
import { bulkImportStudents, downloadStudentTemplate } from "@/lib/bulk-api";

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<SafeUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterActive, setFilterActive] = useState<"" | "true" | "false">("");
  const [pendingPage, setPendingPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const load = useCallback(
    async (page = 1) => {
      try {
        setLoading(true);
        setError(null);
        const [usersRes, deptList] = await Promise.all([
          getUsers({
            page,
            limit: 20,
            role: "STUDENT",
            search: debouncedSearch || undefined,
            departmentId: filterDept || undefined,
            isActive: filterActive || undefined,
          }),
          getAdminDepartments(),
        ]);
        setStudents(usersRes.data);
        setMeta(usersRes.meta);
        setDepartments(deptList);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load students");
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, filterDept, filterActive]
  );

  useEffect(() => {
    load(pendingPage);
  }, [load, pendingPage]);

  const goToPage = (page: number) => {
    if (page < 1 || page > meta.totalPages) return;
    setPendingPage(page);
  };

  const resetFilters = () => {
    setSearch("");
    setFilterDept("");
    setFilterActive("");
    setPendingPage(1);
  };

  const deptMap = new Map(departments.map((d) => [d.id, d]));

  return (
    <div className="admin-page" data-testid="admin-students-page">
      <header className="admin-page-header">
        <div>
          <nav className="nd-breadcrumb" aria-label="Breadcrumb">Admin / Students</nav>
          <h1 className="admin-page-title">Student Management</h1>
          <p className="admin-page-subtitle">
            Bulk-import and manage student records across classrooms and academic departments.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="admin-btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => setShowBulkImport(true)}
          >
            <UploadCloud style={{ width: 14, height: 14 }} />
            Bulk Import CSV
          </button>
        </div>
      </header>

      {/* Summary stats */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-value">{meta.total}</div>
          <div className="admin-stat-label">Total Enrolled Students</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">
            {students.length > 0 ? students.filter((s) => s.isActive).length : "—"}
          </div>
          <div className="admin-stat-label">Active (current page)</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{departments.length}</div>
          <div className="admin-stat-label">Departments</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="admin-filter-bar">
        <div className="admin-search-wrap">
          <Search className="admin-search-icon" style={{ width: 16, height: 16 }} />
          <input
            className="admin-search-input"
            placeholder="Search students by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="admin-filter-select"
          value={filterDept}
          onChange={(e) => {
            setFilterDept(e.target.value);
            setPendingPage(1);
          }}
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} - {d.name}
            </option>
          ))}
        </select>
        <select
          className="admin-filter-select"
          value={filterActive}
          onChange={(e) => {
            setFilterActive(e.target.value as "" | "true" | "false");
            setPendingPage(1);
          }}
        >
          <option value="">All Statuses</option>
          <option value="true">Active Only</option>
          <option value="false">Inactive Only</option>
        </select>
        {(search || filterDept || filterActive) && (
          <button className="admin-btn-secondary" onClick={resetFilters}>
            Clear Filters
          </button>
        )}
      </div>

      {error && (
        <div className="admin-error-banner" role="alert">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Email</th>
              <th>Department</th>
              <th>Status</th>
              <th>Enrolled</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "32px" }}>
                  Loading students…
                </td>
              </tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "40px" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <GraduationCap style={{ width: 32, height: 32, color: "var(--nd-muted)" }} />
                    <p style={{ margin: 0, fontWeight: 500, color: "var(--nd-navy)" }}>
                      No students found
                    </p>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--nd-muted)" }}>
                      Use Bulk Import CSV to enroll students in batches.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              students.map((student) => {
                const dept = student.departmentId ? deptMap.get(student.departmentId) : null;
                return (
                  <tr key={student.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--nd-navy)" }}>
                        {student.firstName} {student.lastName}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 13, color: "var(--nd-muted)" }}>
                        {student.email}
                      </span>
                    </td>
                    <td>
                      {dept ? (
                        <span className="admin-chip">{dept.code}</span>
                      ) : (
                        <span style={{ color: "var(--nd-faint)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`admin-status-badge ${
                          student.isActive
                            ? "admin-status-badge--active"
                            : "admin-status-badge--inactive"
                        }`}
                      >
                        {student.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12.5, color: "var(--nd-muted)" }}>
                        {new Date(student.createdAt).toLocaleDateString()}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 16,
            fontSize: 13,
            color: "var(--nd-muted)",
          }}
        >
          <div>
            Showing {(meta.page - 1) * meta.limit + 1} to{" "}
            {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} students
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="admin-btn-secondary"
              disabled={meta.page <= 1}
              onClick={() => goToPage(meta.page - 1)}
            >
              Previous
            </button>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 8px",
                fontWeight: 600,
              }}
            >
              Page {meta.page} of {meta.totalPages}
            </span>
            <button
              className="admin-btn-secondary"
              disabled={meta.page >= meta.totalPages}
              onClick={() => goToPage(meta.page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        title="Bulk Import Students"
        entityName="Students"
        onDownloadTemplate={downloadStudentTemplate}
        onUpload={bulkImportStudents}
        onSuccess={() => load(pendingPage)}
      />
    </div>
  );
}
