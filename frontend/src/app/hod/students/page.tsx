"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getHodStudents, getHodStudentStatus, updateHodStudent, HodStudent } from "@/lib/hod-api";
import { ApiError } from "@/lib/api";
import { Search, RefreshCw, Activity, Edit2 } from "lucide-react";
import { PageHeader, Badge, Button, Input, Select } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlays";
import { TableSkeleton, EmptyState, ErrorState, Pagination, ButtonSpinner } from "@/components/ui/feedback";
import { ClearanceTicks } from "@/components/clearance/ClearanceTicks";
import { ClearanceModal } from "@/components/clearance/ClearanceModal";

export default function HodStudentsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<HodStudent[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingStatusStudent, setViewingStatusStudent] = useState<HodStudent | null>(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [editingStudent, setEditingStudent] = useState<HodStudent | null>(null);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    registerNumber: "",
    rollNumber: "",
    admissionYear: 2024,
    isActive: true,
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getHodStudents({ page: currentPage, limit: 20, search: search.trim() || undefined });
      setStudents(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load students.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const openEdit = (s: HodStudent) => {
    setEditingStudent(s);
    setEditForm({
      firstName: s.user.firstName,
      lastName: s.user.lastName,
      email: s.user.email,
      registerNumber: s.registerNumber,
      rollNumber: s.rollNumber || "",
      admissionYear: s.admissionYear,
      isActive: s.user.isActive,
    });
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await updateHodStudent(editingStudent.id, {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        email: editForm.email.trim() || undefined,
        registerNumber: editForm.registerNumber.trim(),
        rollNumber: editForm.rollNumber.trim() || null,
        admissionYear: Number(editForm.admissionYear),
        isActive: editForm.isActive,
      });
      setEditingStudent(null);
      load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Failed to update student details.");
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb="HOD / Students"
        title="Department Students"
        description="All students in your department. Edit details or view clearance progress pipeline."
        actions={
          <Button variant="secondary" onClick={load} aria-label="Refresh">
            <RefreshCw style={{ width: 14, height: 14 }} />
            Refresh
          </Button>
        }
      />

      <div className="nd-filter-bar" role="search">
        <div className="nd-search-wrap">
          <Search className="nd-search-icon" style={{ width: 16, height: 16 }} />
          <input
            className="nd-input nd-search-input"
            placeholder="Search by name or register number..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            aria-label="Search students"
          />
        </div>
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
            description="There are no students in your department matching the current filters."
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
                  <th>Classroom</th>
                  <th>Clearance</th>
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
                    <td className="nd-cell-secondary">{s.classroom.name} &middot; Sem {s.classroom.semester}</td>
                    <td>
                      <ClearanceTicks
                        clearance={s.clearance}
                        onClick={() => setViewingStatusStudent(s)}
                      />
                    </td>
                    <td>
                      <Badge tone={s.user.isActive ? "success" : "danger"}>
                        {s.user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingStatusStudent(s)}
                          aria-label={"View clearance progress for " + s.user.firstName}
                          title="View clearance progress"
                        >
                          <Activity style={{ width: 14, height: 14 }} />
                          Progress
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEdit(s)}
                          aria-label={"Edit student " + s.user.firstName}
                        >
                          <Edit2 style={{ width: 13, height: 13 }} />
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

      {editingStudent && (
        <Modal
          title="Edit Student Details"
          description={`Updating information for ${editingStudent.user.firstName} ${editingStudent.user.lastName}`}
          onClose={() => setEditingStudent(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditingStudent(null)}>Cancel</Button>
              <Button type="submit" form="hod-student-edit-form" disabled={editSubmitting}>
                {editSubmitting && <ButtonSpinner />}
                {editSubmitting ? "Saving…" : "Save Changes"}
              </Button>
            </>
          }
        >
          {editError && (
            <div className="nd-alert nd-alert-error" role="alert" style={{ marginBottom: 14 }}>
              <span>{editError}</span>
            </div>
          )}
          <form id="hod-student-edit-form" onSubmit={handleEditSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="nd-form-grid">
              <Input
                label="First name"
                required
                value={editForm.firstName}
                onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
              />
              <Input
                label="Last name"
                required
                value={editForm.lastName}
                onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
              />
            </div>
            <Input
              label="Email"
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
            <div className="nd-form-grid">
              <Input
                label="Register number"
                required
                value={editForm.registerNumber}
                onChange={(e) => setEditForm({ ...editForm, registerNumber: e.target.value })}
              />
              <Input
                label="Roll number"
                value={editForm.rollNumber}
                onChange={(e) => setEditForm({ ...editForm, rollNumber: e.target.value })}
              />
            </div>
            <div className="nd-form-grid">
              <Input
                label="Admission year"
                type="number"
                required
                value={editForm.admissionYear}
                onChange={(e) => setEditForm({ ...editForm, admissionYear: parseInt(e.target.value, 10) || 2024 })}
              />
              <Select
                label="Account status"
                value={editForm.isActive ? "active" : "inactive"}
                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === "active" })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </form>
        </Modal>
      )}

      {viewingStatusStudent && (
        <ClearanceModal
          isOpen={Boolean(viewingStatusStudent)}
          onClose={() => setViewingStatusStudent(null)}
          studentId={viewingStatusStudent.id}
          studentName={`${viewingStatusStudent.user.firstName} ${viewingStatusStudent.user.lastName}`}
          registerNumber={viewingStatusStudent.registerNumber}
          loadStatus={getHodStudentStatus}
          fullPageUrl={`/hod/students/${viewingStatusStudent.id}/status`}
        />
      )}
    </div>
  );
}
