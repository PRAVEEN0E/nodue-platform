"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  getHods,
  createHod,
  updateHodStatus,
  getAdminDepartments,
  SafeUser,
  Department,
  CreateHodPayload,
} from "@/lib/admin-api";
import { ApiError } from "@/lib/api";

function CreateHodModal({
  departments,
  onClose,
  onSuccess,
}: {
  departments: Department[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<CreateHodPayload>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    departmentId: "",
  });
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

  const availableDepts = departments.filter((d) => !d.hodUserId);

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
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(form.password)) {
      errors.password = "Must be at least 8 characters with an uppercase letter, lowercase letter, and a number";
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
      await createHod(form);
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
        setServerError("Failed to create HOD. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="admin-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="hod-create-modal"
    >
      <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="hod-create-title" aria-describedby="hod-create-desc">
        <div className="admin-modal-header">
          <h2 className="admin-modal-title" id="hod-create-title">Create HOD Account</h2>
          <button className="admin-modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <p
        id="hod-create-desc"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
        >
        Create a new Head of Department account and assign it to a department without an HOD.
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
                placeholder="e.g. Arjun"
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
                placeholder="e.g. Sharma"
                required
                minLength={2}
                autoComplete="family-name"
              />
              {fieldErrors.lastName && (
                <p className="admin-form-error">{fieldErrors.lastName}</p>
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
              placeholder="hod@institution.edu"
              required
              autoComplete="email"
            />
            {fieldErrors.email && (
              <p className="admin-form-error">{fieldErrors.email}</p>
            )}
          </div>

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

          <div className="admin-form-group">
            <label className="admin-form-label">Assign Department</label>
            {availableDepts.length === 0 ? (
              <p className="admin-form-hint" style={{ color: "#f59e0b" }}>
                All departments already have an HOD assigned.
              </p>
            ) : (
              <select
                className={`admin-form-input${fieldErrors.departmentId ? " input-error" : ""}`}
                name="departmentId"
                value={form.departmentId}
                onChange={handleChange}
                required
              >
                <option value="">Select a department</option>
                {availableDepts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>
            )}
            {fieldErrors.departmentId && (
              <p className="admin-form-error">{fieldErrors.departmentId}</p>
            )}
            <p className="admin-form-hint">Only departments without an HOD are shown.</p>
          </div>

          <div className="admin-modal-footer">
            <button type="button" className="admin-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="admin-btn-primary"
              disabled={submitting || availableDepts.length === 0}
            >
              {submitting ? "Creating…" : "Create HOD"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function HodsPage() {
  const [hods, setHods] = useState<SafeUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterActive, setFilterActive] = useState<"" | "true" | "false">("");
  const [toggling, setToggling] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [hodList, deptList] = await Promise.all([
        getHods({
          search: debouncedSearch || undefined,
          isActive: filterActive || undefined,
        }),
        getAdminDepartments(),
      ]);
      setHods(hodList);
      setDepartments(deptList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load HODs");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterActive]);

  useEffect(() => { load(); }, [load]);

  const handleToggleStatus = async (hod: SafeUser) => {
    setToggling(hod.id);
    try {
      await updateHodStatus(hod.id, !hod.isActive);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update HOD status");
    } finally {
      setToggling(null);
    }
  };

  const deptMap = new Map(departments.map((d) => [d.id, d]));

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <div>
          <nav className="nd-breadcrumb" aria-label="Breadcrumb">Admin / HODs</nav>
          <h1 className="admin-page-title">HOD Management</h1>
          <p className="admin-page-subtitle">
            Create and manage Heads of Department
          </p>
        </div>
        <button
          className="admin-btn-primary"
          onClick={() => setShowCreate(true)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Create HOD
        </button>
      </header>

      {/* Summary stats */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-value">{departments.length}</div>
          <div className="admin-stat-label">Total Departments</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">{hods.length}</div>
          <div className="admin-stat-label">Assigned HODs</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">
            {departments.length > 0 ? `${Math.round((hods.length / departments.length) * 100)}%` : "—"}
          </div>
          <div className="admin-stat-label">HOD Coverage</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-value">
            {departments.filter((d) => !d.hodUserId).length}
          </div>
          <div className="admin-stat-label">Without HOD</div>
        </div>
      </div>

      {/* Filters */}
      <div className="admin-filter-bar">
        <div className="admin-search-wrap">
          <svg className="admin-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            className="admin-search-input"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="admin-filter-select"
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value as "" | "true" | "false")}
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
          <button className="admin-btn-ghost" onClick={load}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="admin-page-loading">
          <div className="admin-spinner" />
          <p>Loading HODs…</p>
        </div>
      ) : (
        <div className="admin-table-card" data-testid="admin-hods-table">
          {hods.length === 0 ? (
            <div className="admin-empty-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              <p>No HODs found.</p>
              <button className="admin-btn-primary" onClick={() => setShowCreate(true)}>
                Create First HOD
              </button>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {hods.map((hod) => {
                  const dept = hod.departmentId ? deptMap.get(hod.departmentId) : null;
                  return (
                    <tr key={hod.id}>
                      <td>
                        <div className="admin-table-user">
                          <div className="admin-table-avatar">
                            {hod.firstName[0]}{hod.lastName[0]}
                          </div>
                          <div>
                            <p className="admin-table-primary">{hod.firstName} {hod.lastName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="admin-table-secondary">{hod.email}</td>
                      <td>
                        {dept ? (
                          <span className="admin-code-badge">{dept.code}</span>
                        ) : (
                          <span className="admin-table-secondary">—</span>
                        )}
                      </td>
                      <td>
                        <span className={`admin-status-badge ${hod.isActive ? "admin-status-badge--success" : "admin-status-badge--danger"}`}>
                          {hod.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="admin-table-secondary">
                        {new Date(hod.createdAt).toLocaleDateString("en-IN")}
                      </td>
                      <td>
                        <button
                          className={`admin-btn-sm ${hod.isActive ? "admin-btn-sm--danger" : "admin-btn-sm--success"}`}
                          onClick={() => handleToggleStatus(hod)}
                          disabled={toggling === hod.id}
                        >
                          {toggling === hod.id
                            ? "…"
                            : hod.isActive
                            ? "Deactivate"
                            : "Activate"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreate && (
        <CreateHodModal
          departments={departments}
          onClose={() => setShowCreate(false)}
          onSuccess={load}
        />
      )}
    </div>
  );
}
