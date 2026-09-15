"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  getAdvisorSubjects,
  createAdvisorSubject,
  updateAdvisorSubject,
  getAdvisorSubjectById,
  getAdvisorStaff,
  getAdvisorStaffAvailable,
  mapStaffToSubject,
  unmapStaffFromSubject,
  AdvisorSubject,
  AdvisorStaff,
  AdvisorAvailableStaff,
} from "@/lib/advisor-api";
import { ApiError } from "@/lib/api";
import { Plus, Search, RefreshCw, X, UploadCloud } from "lucide-react";
import { PageHeader, Badge, Button, Input, Select } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlays";
import { TableSkeleton, EmptyState, ErrorState, Pagination, ButtonSpinner } from "@/components/ui/feedback";
import { BulkImportModal } from "@/components/ui/BulkImportModal";
import { bulkImportSubjects, downloadSubjectTemplate } from "@/lib/bulk-api";

function staffOptionLabel(st: AdvisorAvailableStaff | AdvisorStaff): string {
  const home = "department" in st && st.department ? ` · ${st.department.code}` : "";
  return `${st.user.firstName} ${st.user.lastName} · ${st.employeeCode}${home}`;
}

export default function AdvisorSubjectsPage() {
  const [subjects, setSubjects] = useState<AdvisorSubject[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [showCreate, setShowCreate] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", credits: 3, semester: 1 });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [detail, setDetail] = useState<AdvisorSubject | null>(null);
  const [staffOptions, setStaffOptions] = useState<Array<AdvisorAvailableStaff | AdvisorStaff>>([]);
  const [assignId, setAssignId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const [editing, setEditing] = useState<AdvisorSubject | null>(null);
  const [editForm, setEditForm] = useState({ name: "", credits: 3, semester: 1 });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdvisorSubjects({
        page: currentPage,
        limit: 20,
        search: search.trim() || undefined,
        semester: semesterFilter ? Number(semesterFilter) : undefined,
      });
      setSubjects(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load subjects.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, semesterFilter]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.code.trim().length < 2) e.code = "Subject code must be at least 2 characters";
    if (form.name.trim().length < 2) e.name = "Subject name must be at least 2 characters";
    if (!Number.isInteger(form.credits) || form.credits < 1 || form.credits > 10) e.credits = "Credits must be between 1 and 10";
    if (!Number.isInteger(form.semester) || form.semester < 1 || form.semester > 8) e.semester = "Semester must be between 1 and 8";
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setFieldErrors({});
    try {
      await createAdvisorSubject({
        code: form.code.trim(),
        name: form.name.trim(),
        credits: form.credits,
        semester: form.semester,
      });
      setShowCreate(false);
      setForm({ code: "", name: "", credits: 3, semester: 1 });
      setCurrentPage(1);
      load();
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        const m: Record<string, string> = {};
        for (const d of err.details as Array<{ path?: string; message?: string }>) {
          if (d.path && d.message) m[d.path] = d.message;
        }
        if (Object.keys(m).length > 0) setFieldErrors(m);
        else setFieldErrors({ code: err.message });
      } else {
        setFieldErrors({ code: err instanceof ApiError ? err.message : "Failed to create subject." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (id: string) => {
    setMapError(null);
    setAssignId("");
    try {
      // Candidates = eligible unassigned staff (available) + staff already
      // adopted into this classroom (assigned), deduped. No creating here:
      // admin owns staff accounts; advisors only assign existing staff.
      const [subject, availRes, assignedRes] = await Promise.all([
        getAdvisorSubjectById(id),
        getAdvisorStaffAvailable({ page: 1, limit: 100 }),
        getAdvisorStaff({ page: 1, limit: 100 }),
      ]);
      setDetail(subject);
      const merged: Array<AdvisorAvailableStaff | AdvisorStaff> = [
        ...availRes.data,
        ...assignedRes.data.filter((s) => !availRes.data.some((a) => a.id === s.id)),
      ];
      setStaffOptions(merged);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load subject.");
    }
  };

  const refreshDetail = async (id: string) => {
    const subject = await getAdvisorSubjectById(id);
    setDetail(subject);
  };

  const handleAssign = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!detail || !assignId) return;
    setAssigning(true);
    setMapError(null);
    try {
      await mapStaffToSubject(detail.id, assignId);
      setAssignId("");
      await refreshDetail(detail.id);
      load();
    } catch (err) {
      setMapError(err instanceof ApiError ? err.message : "Failed to assign staff.");
    } finally {
      setAssigning(false);
    }
  };

  const handleUnmap = async (staffId: string) => {
    if (!detail) return;
    setMapError(null);
    try {
      await unmapStaffFromSubject(detail.id, staffId);
      await refreshDetail(detail.id);
      load();
    } catch (err) {
      setMapError(err instanceof ApiError ? err.message : "Failed to remove assignment.");
    }
  };

  const openEdit = (s: AdvisorSubject) => {
    setEditing(s);
    setEditForm({ name: s.name, credits: s.credits, semester: s.semester });
    setEditError(null);
  };

  const handleEdit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!editing) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await updateAdvisorSubject(editing.id, {
        name: editForm.name.trim(),
        credits: editForm.credits,
        semester: editForm.semester,
      });
      setEditing(null);
      load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Failed to update subject.");
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb="Advisor / Subjects"
        title="Subjects"
        description="Subjects for your classroom. Open a subject to map staff."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="secondary"
              onClick={() => setShowBulkImport(true)}
            >
              <UploadCloud style={{ width: 14, height: 14 }} />
              Bulk Import CSV
            </Button>
            <Button onClick={() => { setFieldErrors({}); setShowCreate(true); }}>
              <Plus style={{ width: 14, height: 14 }} />
              Add Subject
            </Button>
          </div>
        }
      />

      <div className="nd-filter-bar" role="search">
        <div className="nd-search-wrap">
          <Search className="nd-search-icon" style={{ width: 16, height: 16 }} />
          <input
            className="nd-input nd-search-input"
            placeholder="Search by subject name or code…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            aria-label="Search subjects"
          />
        </div>
        <select
          className="nd-select" style={{ width: "auto", minWidth: 150 }}
          value={semesterFilter}
          onChange={(e) => { setSemesterFilter(e.target.value); setCurrentPage(1); }}
          aria-label="Filter by semester"
        >
          <option value="">All Semesters</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
            <option key={s} value={s}>Semester {s}</option>
          ))}
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
      ) : subjects.length === 0 ? (
        <div className="nd-table-card">
          <EmptyState
            title="No subjects found"
            description="Add subjects for your classroom, then map staff to them."
            action={
              <Button onClick={() => setShowCreate(true)}>
                <Plus style={{ width: 14, height: 14 }} />
                Add Subject
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
                  <th>Code</th>
                  <th>Subject</th>
                  <th>Credits</th>
                  <th>Semester</th>
                  <th>Assigned Staff</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={s.id}>
                    <td><span className="nd-code">{s.code}</span></td>
                    <td className="nd-cell-primary">{s.name}</td>
                    <td className="nd-cell-num">{s.credits}</td>
                    <td><Badge tone="info">Sem {s.semester}</Badge></td>
                    <td>
                      {s.subjectStaff.length === 0 ? (
                        <Badge tone="warning">Unassigned</Badge>
                      ) : (
                        <span className="nd-cell-primary">
                          {s.subjectStaff.length} staff
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <Button variant="secondary" size="sm" onClick={() => openDetail(s.id)}>
                          Manage
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} unit="subjects" onChange={setCurrentPage} />
        </div>
      )}

      {showCreate && (
        <Modal
          title="Add subject"
          description="The subject is created in your assigned classroom."
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" form="advisor-subject-form" disabled={submitting}>
                {submitting && <ButtonSpinner />}
                {submitting ? "Adding…" : "Add Subject"}
              </Button>
            </>
          }
        >
          <form id="advisor-subject-form" onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="nd-form-grid-mixed">
              <Input label="Code" required placeholder="CS301" value={form.code} error={fieldErrors.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })} autoComplete="off" />
              <Input label="Name" required placeholder="Machine Learning" value={form.name} error={fieldErrors.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" />
            </div>
            <div className="nd-form-grid">
              <Input label="Credits" type="number" required min={1} max={10} value={form.credits} error={fieldErrors.credits}
                onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} />
              <Select label="Semester" value={form.semester}
                onChange={(e) => setForm({ ...form, semester: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>Semester {s}</option>
                ))}
              </Select>
            </div>
          </form>
        </Modal>
      )}

      {detail && (
        <Modal
          title={detail.name}
          description={`${detail.code} · Semester ${detail.semester} · ${detail.credits} credits`}
          onClose={() => setDetail(null)}
          maxWidth={600}
          footer={<Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>}
        >
          <div>
            <span className="nd-label">Assigned staff</span>
            {detail.subjectStaff.length === 0 ? (
              <p className="nd-cell-secondary">No staff assigned yet.</p>
            ) : (
              detail.subjectStaff.map(({ staff }) => (
                <div className="nd-def-row" key={staff.id}>
                  <span className="nd-def-label">
                    {staff.user.firstName} {staff.user.lastName} · {staff.employeeCode}
                  </span>
                  <span className="nd-def-value">
                    <Button variant="ghost" size="sm" onClick={() => handleUnmap(staff.id)} aria-label={`Remove ${staff.user.firstName}`}>
                      <X style={{ width: 14, height: 14 }} /> Remove
                    </Button>
                  </span>
                </div>
              ))
            )}
          </div>
          <div>
            <span className="nd-label">Assign staff</span>
            {mapError && <div className="nd-alert nd-alert-error" role="alert" style={{ marginBottom: 10 }}><span>{mapError}</span></div>}
            <form onSubmit={handleAssign} style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <select
                  className="nd-select"
                  value={assignId}
                  onChange={(e) => setAssignId(e.target.value)}
                  aria-label="Select staff to assign"
                  style={{ width: "100%" }}
                >
                  <option value="">Select staff member…</option>
{staffOptions
                    .filter((st) => !detail.subjectStaff.some((m) => m.staff.id === st.id))
                    .map((st) => (
                      <option key={st.id} value={st.id}>
                        {staffOptionLabel(st)}
                      </option>
                    ))}
                </select>
              </div>
              <Button type="submit" disabled={!assignId || assigning}>
                {assigning && <ButtonSpinner />}
                Assign
              </Button>
            </form>
            <p className="nd-hint">Assign existing staff to this subject. Staff accounts are created by the administrator.</p>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          title="Edit subject"
          description={`${editing.code} · code and classroom cannot be changed`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" form="advisor-subject-edit" disabled={editSubmitting}>
                {editSubmitting && <ButtonSpinner />}
                {editSubmitting ? "Saving…" : "Save"}
              </Button>
            </>
          }
        >
          {editError && <div className="nd-alert nd-alert-error" role="alert"><span>{editError}</span></div>}
          <form id="advisor-subject-edit" onSubmit={handleEdit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input label="Name" required value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} autoComplete="off" />
            <div className="nd-form-grid">
              <Input label="Credits" type="number" required min={1} max={10} value={editForm.credits}
                onChange={(e) => setEditForm({ ...editForm, credits: Number(e.target.value) })} />
              <Select label="Semester" value={editForm.semester}
                onChange={(e) => setEditForm({ ...editForm, semester: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>Semester {s}</option>
                ))}
              </Select>
            </div>
          </form>
        </Modal>
      )}

      <BulkImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        title="Bulk Import Subjects"
        entityName="Subjects"
        onDownloadTemplate={downloadSubjectTemplate}
        onUpload={bulkImportSubjects}
        onSuccess={() => load()}
      />
    </div>
  );
}
