"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  getAdvisorStudents,
  createAdvisorStudent,
  updateAdvisorStudent,
  getAdvisorStudentById,
  AdvisorStudent,
  AdvisorStudentDetail,
} from "@/lib/advisor-api";
import { ApiError } from "@/lib/api";
import { Plus, Search, RefreshCw, Eye } from "lucide-react";
import { PageHeader, Badge, Button, Input, Select } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlays";
import { TableSkeleton, EmptyState, ErrorState, Pagination, ButtonSpinner } from "@/components/ui/feedback";

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export default function AdvisorStudentsPage() {
  const [students, setStudents] = useState<AdvisorStudent[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    registerNumber: "",
    rollNumber: "",
    admissionYear: new Date().getFullYear(),
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [detail, setDetail] = useState<AdvisorStudentDetail | null>(null);
  const [editing, setEditing] = useState<AdvisorStudentDetail | null>(null);
  const [editActive, setEditActive] = useState(true);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdvisorStudents({
        page: currentPage,
        limit: 20,
        search: search.trim() || undefined,
        isActive: statusFilter === "" ? undefined : statusFilter === "active",
      });
      setStudents(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load students.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.firstName.trim().length < 2) e.firstName = "First name must be at least 2 characters";
    if (form.lastName.trim().length < 2) e.lastName = "Last name must be at least 2 characters";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email address";
    if (!PASSWORD_RE.test(form.password)) e.password = "Min 8 characters with uppercase, lowercase and number";
    if (form.registerNumber.trim().length < 3) e.registerNumber = "Register number must be at least 3 characters";
    if (!Number.isInteger(form.admissionYear) || form.admissionYear < 2000 || form.admissionYear > 2100) {
      e.admissionYear = "Enter a valid admission year";
    }
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setFieldErrors({});
    try {
      await createAdvisorStudent({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        registerNumber: form.registerNumber.trim(),
        rollNumber: form.rollNumber.trim() || null,
        admissionYear: form.admissionYear,
      });
      setShowCreate(false);
      setForm({ firstName: "", lastName: "", email: "", password: "", registerNumber: "", rollNumber: "", admissionYear: new Date().getFullYear() });
      setCurrentPage(1);
      load();
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        const m: Record<string, string> = {};
        for (const d of err.details as Array<{ path?: string; message?: string }>) {
          if (d.path && d.message) m[d.path] = d.message;
        }
        if (Object.keys(m).length > 0) setFieldErrors(m);
        else setFieldErrors({ email: err.message });
      } else {
        setFieldErrors({ email: err instanceof ApiError ? err.message : "Failed to create student." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (id: string) => {
    try {
      const s = await getAdvisorStudentById(id);
      setDetail(s);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load student.");
    }
  };

  const openEdit = async (id: string) => {
    try {
      const s = await getAdvisorStudentById(id);
      setEditing(s);
      setEditActive(s.user.isActive);
      setEditError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load student.");
    }
  };

  const handleEdit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!editing) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await updateAdvisorStudent(editing.id, { isActive: editActive });
      setEditing(null);
      if (detail?.id === editing.id) {
        const s = await getAdvisorStudentById(editing.id);
        setDetail(s);
      }
      load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Failed to update student.");
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb="Advisor / Students"
        title="Students"
        description="Students enrolled in your assigned classroom."
        actions={
          <Button onClick={() => { setFieldErrors({}); setShowCreate(true); }}>
            <Plus style={{ width: 14, height: 14 }} />
            Add Student
          </Button>
        }
      />

      <div className="nd-filter-bar" role="search">
        <div className="nd-search-wrap">
          <Search className="nd-search-icon" style={{ width: 16, height: 16 }} />
          <input
            className="nd-input nd-search-input"
            placeholder="Search by name, email or register number…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            aria-label="Search students"
          />
        </div>
        <select
          className="nd-select" style={{ width: "auto", minWidth: 140 }}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <Button variant="secondary" onClick={load} aria-label="Refresh list">
          <RefreshCw style={{ width: 14, height: 14 }} />
        </Button>
      </div>

      {error && !loading && (
        <div className="nd-card" style={{ marginBottom: 16 }}>
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : students.length === 0 ? (
        <div className="nd-table-card">
          <EmptyState
            title="No students found"
            description="There are no students in your classroom matching the current filters."
            action={
              <Button onClick={() => setShowCreate(true)}>
                <Plus style={{ width: 14, height: 14 }} />
                Add Student
              </Button>
            }
          />
        </div>
      ) : (
        <div className="nd-table-card">
          <div className="nd-table-scroll">
            <table className="nd-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Register No</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="nd-user-cell">
                        <div className="nd-avatar" aria-hidden="true">
                          {s.user.firstName[0]}{s.user.lastName[0]}
                        </div>
                        <span className="nd-cell-primary">{s.user.firstName} {s.user.lastName}</span>
                      </div>
                    </td>
                    <td className="nd-cell-secondary" style={{ fontFamily: "monospace", fontSize: 12.5 }}>{s.registerNumber}</td>
                    <td className="nd-cell-secondary">{s.user.email}</td>
                    <td>
                      <Badge tone={s.user.isActive ? "success" : "danger"}>
                        {s.user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <Button variant="ghost" size="sm" onClick={() => openDetail(s.id)} aria-label={`View ${s.user.firstName}`}>
                          <Eye style={{ width: 14, height: 14 }} />
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => openEdit(s.id)}>
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} unit="students" onChange={setCurrentPage} />
        </div>
      )}

      {showCreate && (
        <Modal
          title="Add student"
          description="The student is automatically enrolled in your assigned classroom."
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" form="advisor-student-form" disabled={submitting}>
                {submitting && <ButtonSpinner />}
                {submitting ? "Adding…" : "Add Student"}
              </Button>
            </>
          }
        >
          <form id="advisor-student-form" onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="nd-form-grid">
              <Input label="First name" required value={form.firstName} error={fieldErrors.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })} autoComplete="given-name" />
              <Input label="Last name" required value={form.lastName} error={fieldErrors.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })} autoComplete="family-name" />
            </div>
            <Input label="Email" type="email" required value={form.email} error={fieldErrors.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
            <Input label="Password" type="password" required minLength={8} value={form.password} error={fieldErrors.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password"
              hint="Min 8 characters with uppercase, lowercase and number." />
            <div className="nd-form-grid">
              <Input label="Register number" required value={form.registerNumber} error={fieldErrors.registerNumber}
                onChange={(e) => setForm({ ...form, registerNumber: e.target.value })} autoComplete="off" />
              <Input label="Roll number (optional)" value={form.rollNumber} error={fieldErrors.rollNumber}
                onChange={(e) => setForm({ ...form, rollNumber: e.target.value })} autoComplete="off" />
            </div>
            <Input label="Admission year" type="number" required value={form.admissionYear}
              error={fieldErrors.admissionYear}
              onChange={(e) => setForm({ ...form, admissionYear: Number(e.target.value) })} />
          </form>
        </Modal>
      )}

      {detail && (
        <Modal
          title={`${detail.user.firstName} ${detail.user.lastName}`}
          description={`${detail.registerNumber} · ${detail.user.email}`}
          onClose={() => setDetail(null)}
          footer={<Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>}
        >
          <div>
            <div className="nd-def-row"><span className="nd-def-label">Status</span><span className="nd-def-value"><Badge tone={detail.user.isActive ? "success" : "danger"}>{detail.user.isActive ? "Active" : "Inactive"}</Badge></span></div>
            <div className="nd-def-row"><span className="nd-def-label">Roll number</span><span className="nd-def-value">{detail.rollNumber ?? "—"}</span></div>
            <div className="nd-def-row"><span className="nd-def-label">Admission year</span><span className="nd-def-value">{detail.admissionYear}</span></div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          title="Edit student status"
          description={`${editing.user.firstName} ${editing.user.lastName} · ${editing.registerNumber}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" form="advisor-student-edit" disabled={editSubmitting}>
                {editSubmitting && <ButtonSpinner />}
                {editSubmitting ? "Saving…" : "Save"}
              </Button>
            </>
          }
        >
          {editError && <div className="nd-alert nd-alert-error" role="alert"><span>{editError}</span></div>}
          <form id="advisor-student-edit" onSubmit={handleEdit}>
            <Select label="Account status" value={editActive ? "active" : "inactive"}
              onChange={(e) => setEditActive(e.target.value === "active")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </form>
        </Modal>
      )}
    </div>
  );
}
