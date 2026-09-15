"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  getAdminStaff,
  createAdminStaff,
  updateAdminStaff,
  deleteAdminStaff,
  getAdminDepartments,
  AdminStaff,
  Department,
  CreateStaffPayload,
} from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { MoreVertical, Pencil, Power, Trash2, UploadCloud } from "lucide-react";
import { BulkImportModal } from "@/components/ui/BulkImportModal";
import { bulkImportStaff, downloadStaffTemplate } from "@/lib/bulk-api";

const emptyForm = () => ({
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  employeeCode: "",
  designation: "",
  departmentId: "",
});

function StaffKebabMenu({
  staff,
  onEdit,
  onToggleStatus,
  toggling,
  onDelete,
}: {
  staff: AdminStaff;
  onEdit: () => void;
  onToggleStatus: () => void;
  toggling: boolean;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, up: false });

  const openMenu = () => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const menuW = 184;
    const menuH = 150;
    const up = rect.bottom + menuH + 8 > window.innerHeight - 10;
    const left = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8));
    setPos({ top: up ? rect.top - menuH - 8 : rect.bottom + 8, left, up });
    setOpen(true);
  };

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>(".admin-staff-menu-item")
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length].focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1].focus();
    }
  };

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    top: pos.top,
    left: pos.left,
    ...(pos.up ? { transformOrigin: "bottom right" } : { transformOrigin: "top right" }),
  };

  return (
    <div className="admin-staff-kebab" ref={wrapRef}>
      <button
        className="admin-staff-kebab-btn"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label="Staff actions"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="admin-staff-kebab-button"
      >
        <MoreVertical size={18} />
      </button>
      {open && (
        <div
          className="admin-staff-menu"
          style={menuStyle}
          role="menu"
          aria-label="Staff actions"
          onKeyDown={onMenuKeyDown}
          data-testid="admin-staff-kebab-menu"
        >
          <button
            className="admin-staff-menu-item"
            role="menuitem"
            onClick={() => { onEdit(); setOpen(false); }}
          >
            <Pencil size={16} />
            Edit
          </button>
          <button
            className="admin-staff-menu-item"
            role="menuitem"
            onClick={() => { onToggleStatus(); setOpen(false); }}
            disabled={toggling}
          >
            <Power size={16} />
            {staff.user.isActive ? "Deactivate" : "Activate"}
          </button>
          <button
            className="admin-staff-menu-item admin-staff-menu-item--danger"
            role="menuitem"
            onClick={() => { onDelete(); setOpen(false); }}
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function StaffFormModal({
  mode,
  staff,
  departments,
  onClose,
  onSuccess,
}: {
  mode: "create" | "edit";
  staff: AdminStaff | null;
  departments: Department[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<CreateStaffPayload>(() =>
    staff && mode === "edit"
      ? {
          firstName: staff.user.firstName,
          lastName: staff.user.lastName,
          email: staff.user.email,
          password: "",
          employeeCode: staff.employeeCode,
          designation: staff.designation,
          departmentId: staff.user.departmentId || "",
        }
      : emptyForm()
  );
  const [isActive, setIsActive] = useState<boolean>(staff ? staff.user.isActive : true);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.firstName.trim() || form.firstName.trim().length < 2) {
      errors.firstName = "First name must be at least 2 characters";
    }
    if (!form.lastName.trim() || form.lastName.trim().length < 2) {
      errors.lastName = "Last name must be at least 2 characters";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = "Please enter a valid email address";
    }
    if (mode === "create") {
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(form.password)) {
        errors.password = "Must be at least 8 characters with an uppercase letter, lowercase letter, and a number";
      }
    }
    if (!form.employeeCode.trim()) {
      errors.employeeCode = "Employee code is required";
    }
    if (!form.designation.trim() || form.designation.trim().length < 2) {
      errors.designation = "Designation must be at least 2 characters";
    }
    if (!form.departmentId) {
      errors.departmentId = "Please select a department";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setServerError(null);
    setFieldErrors({});
    try {
      if (mode === "create") {
        await createAdminStaff(form);
      } else if (staff) {
        const payload: Record<string, unknown> = {};
        if (form.firstName !== staff.user.firstName) payload.firstName = form.firstName;
        if (form.lastName !== staff.user.lastName) payload.lastName = form.lastName;
        if (form.email !== staff.user.email) payload.email = form.email;
        if (form.designation !== staff.designation) payload.designation = form.designation;
        if (form.departmentId !== staff.user.departmentId) payload.departmentId = form.departmentId;
        if (isActive !== staff.user.isActive) payload.isActive = isActive;
        await updateAdminStaff(staff.id, payload);
      }
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        const fieldMap: Record<string, string> = {};
        for (const d of err.details) {
          const path = (d as { path?: string; message?: string }).path;
          const message = (d as { path?: string; message?: string }).message;
          if (path && message) fieldMap[path] = message;
        }
        if (Object.keys(fieldMap).length > 0) {
          setFieldErrors(fieldMap);
        } else {
          setServerError(err.message);
        }
      } else if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError(mode === "create" ? "Failed to create staff member. Please try again." : "Failed to update staff member. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isEdit = mode === "edit";

  return (
    <div
      className="admin-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="staff-create-modal"
    >
      <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="staff-create-title" aria-describedby="staff-create-desc">
        <div className="admin-modal-header">
          <h2 className="admin-modal-title" id="staff-create-title">
            {isEdit ? "Edit Staff" : "Create Staff Account"}
          </h2>
          <button className="admin-modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <p
          id="staff-create-desc"
          style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
        >
          {isEdit
            ? "Update a staff account. Department changes are blocked once the staff member is assigned to a classroom."
            : "Create a new staff account. The staff member enters the department's unassigned pool and can then be assigned by an advisor."}
        </p>

        {serverError && (
          <div className="admin-error-banner admin-error-banner--modal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {serverError}
          </div>
        )}

        <form className="admin-modal-form" onSubmit={handleSubmit}>
          <div className="admin-form-row">
            <div className="admin-form-group">
              <label className="admin-form-label">First Name</label>
              <input
                className={`admin-form-input${fieldErrors.firstName ? " input-error" : ""}`}
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                placeholder="e.g. Priya"
                required
                minLength={2}
                autoComplete="given-name"
              />
              {fieldErrors.firstName && (
                <p className="admin-form-error">{fieldErrors.firstName}</p>
              )}
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Last Name</label>
              <input
                className={`admin-form-input${fieldErrors.lastName ? " input-error" : ""}`}
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                placeholder="e.g. Iyer"
                required
                minLength={2}
                autoComplete="family-name"
              />
              {fieldErrors.lastName && (
                <p className="admin-form-error">{fieldErrors.lastName}</p>
              )}
            </div>
          </div>

          <div className="admin-form-row">
            <div className="admin-form-group">
              <label className="admin-form-label">Employee Code</label>
              <input
                className={`admin-form-input${fieldErrors.employeeCode ? " input-error" : ""}`}
                name="employeeCode"
                value={form.employeeCode}
                onChange={handleChange}
                placeholder="e.g. STAFF00123"
                required
                autoCapitalize="characters"
              />
              {fieldErrors.employeeCode && (
                <p className="admin-form-error">{fieldErrors.employeeCode}</p>
              )}
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">Designation</label>
              <input
                className={`admin-form-input${fieldErrors.designation ? " input-error" : ""}`}
                name="designation"
                value={form.designation}
                onChange={handleChange}
                placeholder="e.g. Assistant Professor"
                required
                minLength={2}
              />
              {fieldErrors.designation && (
                <p className="admin-form-error">{fieldErrors.designation}</p>
              )}
            </div>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Email Address</label>
            <input
              className={`admin-form-input${fieldErrors.email ? " input-error" : ""}`}
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="staff@institution.edu"
              required
              autoComplete="email"
            />
            {fieldErrors.email && (
              <p className="admin-form-error">{fieldErrors.email}</p>
            )}
          </div>

          {!isEdit ? (
            <div className="admin-form-group">
              <label className="admin-form-label">Temporary Password</label>
              <input
                className={`admin-form-input${fieldErrors.password ? " input-error" : ""}`}
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Min 8 chars, uppercase, lowercase, number"
                required
                minLength={8}
                autoComplete="new-password"
              />
              {fieldErrors.password && (
                <p className="admin-form-error">{fieldErrors.password}</p>
              )}
              <p className="admin-form-hint">Must contain uppercase, lowercase, and a number</p>
            </div>
          ) : (
            <div className="admin-form-group">
              <label className="admin-form-label">Status</label>
              <select
                className="admin-form-input"
                value={isActive ? "true" : "false"}
                onChange={(e) => setIsActive(e.target.value === "true")}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
              {isEdit && staff?.classroomId && (
                <p className="admin-form-hint">
                  This staff member is assigned to a classroom — only the status can be changed.
                </p>
              )}
            </div>
          )}

          <div className="admin-form-group">
            <label className="admin-form-label">Department</label>
            <select
              className={`admin-form-input${fieldErrors.departmentId ? " input-error" : ""}`}
              name="departmentId"
              value={form.departmentId}
              onChange={handleChange}
              required
              disabled={isEdit && !!staff?.classroomId}
            >
              <option value="">Select a department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
            {fieldErrors.departmentId && (
              <p className="admin-form-error">{fieldErrors.departmentId}</p>
            )}
            <p className="admin-form-hint">
              {isEdit && staff?.classroomId
                ? "Department can’t be changed while assigned to a classroom."
                : "Department membership determines which advisors can assign this staff member."}
            </p>
          </div>

          <div className="admin-modal-footer">
            <button type="button" className="admin-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="admin-btn-primary"
              disabled={submitting}
            >
              {submitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save Changes" : "Create Staff"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminStaffPage() {
  const [staffList, setStaffList] = useState<AdminStaff[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editing, setEditing] = useState<AdminStaff | null>(null);
  const [deleting, setDeleting] = useState<AdminStaff | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterActive, setFilterActive] = useState<"" | "true" | "false">("");
  const [toggling, setToggling] = useState<string | null>(null);
  const [pendingPage, setPendingPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const load = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const [staffRes, deptList] = await Promise.all([
        getAdminStaff({
          page,
          limit: 20,
          search: debouncedSearch || undefined,
          departmentId: filterDept || undefined,
          isActive: filterActive || undefined,
        }),
        getAdminDepartments(),
      ]);
      setStaffList(staffRes.data);
      setMeta(staffRes.meta);
      setDepartments(deptList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterDept, filterActive]);

  useEffect(() => { load(pendingPage); }, [load, pendingPage]);

  const goToPage = (page: number) => {
    if (page < 1 || page > meta.totalPages) return;
    setPendingPage(page);
  };

  const handleToggleStatus = async (staff: AdminStaff) => {
    setToggling(staff.id);
    try {
      await updateAdminStaff(staff.id, { isActive: !staff.user.isActive });
      await load(pendingPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update staff status");
    } finally {
      setToggling(null);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setFilterDept("");
    setFilterActive("");
    setPendingPage(1);
  };

  const dismissDeleteError = () => setDeleteError(null);

  const deptMap = new Map(departments.map((d) => [d.id, d]));

  return (
    <div className="admin-page" data-testid="admin-staff-page">
      <header className="admin-page-header">
        <div>
          <nav className="nd-breadcrumb" aria-label="Breadcrumb">Admin / Staff</nav>
          <h1 className="admin-page-title">Staff Management</h1>
          <p className="admin-page-subtitle">
            Create and manage staff accounts. Advisors assign existing staff to their classroom subjects.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="admin-btn-secondary"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => setShowBulkImport(true)}
          >
            <UploadCloud style={{ width: 14, height: 14 }} />
            Bulk Import CSV
          </button>
          <button
            className="admin-btn-primary"
            onClick={() => setShowCreate(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create Staff
          </button>
        </div>
      </header>

      {/* Summary stats */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-value">{meta.total}</div>
          <div className="admin-stat-label">Total Staff</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">
            {staffList.length > 0 ? staffList.filter((s) => s.user.isActive).length : "—"}
          </div>
          <div className="admin-stat-label">Active (current page)</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">
            {staffList.length > 0 ? staffList.filter((s) => s.classroomId).length : "—"}
          </div>
          <div className="admin-stat-label">Assigned to Classroom (current page)</div>
        </div>
      </div>

      {/* Filters */}
      <div className="admin-filter-bar">
        <div className="admin-search-wrap">
          <svg className="admin-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            className="admin-search-input"
            placeholder="Search by name, email or employee code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="admin-filter-select"
          value={filterDept}
          onChange={(e) => { setFilterDept(e.target.value); setPendingPage(1); }}
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.code}</option>
          ))}
        </select>
        <select
          className="admin-filter-select"
          value={filterActive}
          onChange={(e) => { setFilterActive(e.target.value as "" | "true" | "false"); setPendingPage(1); }}
        >
          <option value="">All Status</option>
          <option value="true">Active Only</option>
          <option value="false">Inactive Only</option>
        </select>
      </div>

      {error && (
        <div className="admin-error-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
          <button className="admin-btn-ghost" onClick={() => load(pendingPage)}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="admin-page-loading">
          <div className="admin-spinner" />
          <p>Loading staff…</p>
        </div>
      ) : (
        <div className="admin-table-card" data-testid="admin-staff-table">
          {staffList.length === 0 ? (
            <div className="admin-empty-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              <p>No staff members found.</p>
              {search || filterDept || filterActive ? (
                <button className="admin-btn-secondary" onClick={resetFilters}>Clear Filters</button>
              ) : (
                <button className="admin-btn-primary" onClick={() => setShowCreate(true)}>
                  Create First Staff Member
                </button>
              )}
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Employee ID</th>
                  <th>Department</th>
                  <th>Classroom</th>
                  <th>Subject Mappings</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((staff) => {
                  const dept = staff.user.departmentId ? deptMap.get(staff.user.departmentId) : null;
                  return (
                    <tr key={staff.id}>
                      <td>
                        <div className="admin-table-user">
                          <div className="admin-table-avatar">
                            {staff.user.firstName[0]}{staff.user.lastName[0]}
                          </div>
                          <div>
                            <p className="admin-table-primary">{staff.user.firstName} {staff.user.lastName}</p>
                            <p className="admin-table-secondary">{staff.designation}</p>
                          </div>
                        </div>
                      </td>
                      <td className="admin-table-secondary">
                        <span className="admin-staff-email" title={staff.user.email}>{staff.user.email}</span>
                      </td>
                      <td>
                        <span className="admin-staff-emp-id" title={`Employee ID: ${staff.employeeCode}`}>
                          {staff.employeeCode}
                        </span>
                      </td>
                      <td>
                        {dept ? (
                          <span className="admin-code-badge" title={dept.name}>{dept.code}</span>
                        ) : (
                          <span className="admin-table-secondary">—</span>
                        )}
                      </td>
                      <td className="admin-table-secondary">
                        {staff.classroomId ? (
                          <span className="admin-staff-classroom" title={staff.classroom?.name || "Assigned to a classroom"}>
                            <svg className="admin-staff-classroom-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21h18"/><path d="M6 11V5a2 2 0 012-2h8a2 2 0 012 2v6"/><path d="M4 11v9M20 11v9"/><path d="M8 7h2M8 10h2M14 7h2M14 10h2"/></svg>
                            {staff.classroom?.name || "Assigned"}
                          </span>
                        ) : (
                          <span className="admin-staff-classroom-nil">Unassigned</span>
                        )}
                      </td>
                      <td>
                        <span
                          className="admin-staff-subjects"
                          title={`${staff._count?.subjectStaff ?? 0} subject mapping${(staff._count?.subjectStaff ?? 0) === 1 ? "" : "s"}`}
                        >
                          {staff._count?.subjectStaff ?? 0}
                        </span>
                      </td>
                      <td>
                        <span className={`admin-status-badge ${staff.user.isActive ? "admin-status-badge--success" : "admin-status-badge--muted"}`}>
                          {staff.user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="admin-staff-actions">
                        <StaffKebabMenu
                          staff={staff}
                          onEdit={() => setEditing(staff)}
                          onToggleStatus={() => handleToggleStatus(staff)}
                          onDelete={() => setDeleting(staff)}
                          toggling={toggling === staff.id}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {meta.totalPages > 1 && (
        <div className="admin-pagination">
          <button
            className="admin-btn-sm"
            disabled={meta.page <= 1 || loading}
            onClick={() => goToPage(meta.page - 1)}
          >
            Prev
          </button>
          <span className="admin-pagination-info">
            Page {meta.page} of {meta.totalPages} · {meta.total} staff
          </span>
          <button
            className="admin-btn-sm"
            disabled={meta.page >= meta.totalPages || loading}
            onClick={() => goToPage(meta.page + 1)}
          >
            Next
          </button>
        </div>
      )}

      {showCreate && (
        <StaffFormModal
          mode="create"
          staff={null}
          departments={departments}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setPendingPage(1); load(1); }}
        />
      )}

      {editing && (
        <StaffFormModal
          mode="edit"
          staff={editing}
          departments={departments}
          onClose={() => setEditing(null)}
          onSuccess={() => load(pendingPage)}
        />
      )}

      {deleting && (
        <div
          className="admin-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && (setDeleting(null), dismissDeleteError())}
          data-testid="staff-delete-modal"
        >
          <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="staff-delete-title" aria-describedby="staff-delete-desc">
            <div className="admin-modal-header">
              <h2 className="admin-modal-title" id="staff-delete-title">Delete Staff Account</h2>
              <button className="admin-modal-close" onClick={() => { setDeleting(null); dismissDeleteError(); }} aria-label="Close">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <p id="staff-delete-desc" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              Confirm deletion of a staff account.
            </p>
            <p>
              Permanently delete <strong>{deleting.user.firstName} {deleting.user.lastName}</strong> ({deleting.employeeCode})? This removes the account immediately. Staff with subject mappings cannot be deleted.
            </p>
            {deleteError && <div className="admin-error-banner admin-error-banner--modal" data-testid="staff-delete-error">{deleteError}</div>}
            <div className="admin-modal-footer">
              <button className="admin-btn-secondary" onClick={() => { setDeleting(null); dismissDeleteError(); }}>
                Cancel
              </button>
              <button
                className="admin-btn-primary admin-btn-primary--danger"
                onClick={async () => {
                  setDeleteError(null);
                  try {
                    await deleteAdminStaff(deleting.id);
                    setDeleting(null);
                    await load(pendingPage);
                  } catch (err) {
                    setDeleteError(err instanceof ApiError ? err.message : "Failed to delete staff member");
                  }
                }}
              >
                Delete Staff
              </button>
            </div>
          </div>
        </div>
      )}

      <BulkImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        title="Bulk Import Staff"
        entityName="Staff"
        onDownloadTemplate={downloadStaffTemplate}
        onUpload={bulkImportStaff}
        onSuccess={() => load(pendingPage)}
      />
    </div>
  );
}