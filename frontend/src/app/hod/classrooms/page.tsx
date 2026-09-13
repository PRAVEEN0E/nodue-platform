"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  getHodClassrooms,
  createClassroom,
  updateClassroom,
  Classroom,
  CreateClassroomPayload,
  UpdateClassroomPayload,
  PaginationMeta,
} from "@/lib/hod-api";
import { ApiError } from "@/lib/api";
import { GraduationCap, Plus, Search, RefreshCw, Users } from "lucide-react";
import { PageHeader, Badge, Button, Input, Select } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlays";
import { TableSkeleton, EmptyState, ErrorState, Pagination, ButtonSpinner } from "@/components/ui/feedback";

export default function HodClassroomsPage() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [semesterFilter, setSemesterFilter] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createData, setCreateData] = useState<CreateClassroomPayload>({
    name: "",
    batch: "2024-2028",
    semester: 1,
    section: "A",
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null);
  const [editData, setEditData] = useState<UpdateClassroomPayload>({});
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchClassrooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getHodClassrooms({
        page: currentPage,
        limit: 10,
        search: search.trim() || undefined,
        semester: semesterFilter ? parseInt(semesterFilter, 10) : undefined,
      });
      setClassrooms(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to fetch classrooms.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, semesterFilter]);

  useEffect(() => {
    fetchClassrooms();
  }, [fetchClassrooms]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      await createClassroom({
        name: createData.name.trim(),
        batch: createData.batch.trim(),
        semester: Number(createData.semester),
        section: createData.section.trim().toUpperCase(),
      });
      setShowCreateModal(false);
      setCreateData({ name: "", batch: "2024-2028", semester: 1, section: "A" });
      fetchClassrooms();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Failed to create classroom.");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClassroom) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await updateClassroom(editingClassroom.id, {
        ...(editData.name && { name: editData.name.trim() }),
        ...(editData.batch && { batch: editData.batch.trim() }),
        ...(editData.semester && { semester: Number(editData.semester) }),
        ...(editData.section && { section: editData.section.trim().toUpperCase() }),
      });
      setEditingClassroom(null);
      fetchClassrooms();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Failed to update classroom.");
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb="HOD / Classrooms"
        title="Classrooms"
        description="Create, organize, and monitor classrooms and advisor assignments for your department."
        actions={
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus style={{ width: 14, height: 14 }} />
            New Classroom
          </Button>
        }
      />

      <div className="nd-filter-bar" role="search">
        <div className="nd-search-wrap">
          <Search className="nd-search-icon" style={{ width: 16, height: 16 }} />
          <input
            type="text"
            placeholder="Search by classroom name, batch, section…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="nd-input nd-search-input"
            aria-label="Search classrooms"
          />
        </div>
        <select
          value={semesterFilter}
          onChange={(e) => {
            setSemesterFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="nd-select"
          style={{ width: "auto", minWidth: 150 }}
          aria-label="Filter by semester"
        >
          <option value="">All Semesters</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
            <option key={sem} value={sem}>
              Semester {sem}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={fetchClassrooms} aria-label="Refresh list">
          <RefreshCw style={{ width: 14, height: 14 }} />
        </Button>
      </div>

      {error && !loading && (
        <div className="nd-card" style={{ marginBottom: 16 }}>
          <ErrorState message={error} onRetry={fetchClassrooms} />
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : classrooms.length === 0 ? (
        <div className="nd-table-card">
          <EmptyState
            title="No classrooms found"
            description="Get started by creating your department's first classroom, or adjust the search filters."
            action={
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus style={{ width: 14, height: 14 }} />
                Create Classroom
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
                  <th>Classroom</th>
                  <th>Batch</th>
                  <th>Semester</th>
                  <th>Section</th>
                  <th>Advisor</th>
                  <th>Students</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {classrooms.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="nd-user-cell">
                        <span className="nd-stat-icon" style={{ width: 30, height: 30 }}>
                          <GraduationCap style={{ width: 15, height: 15 }} />
                        </span>
                        <span className="nd-cell-primary">{c.name}</span>
                      </div>
                    </td>
                    <td className="nd-cell-secondary" style={{ fontFamily: "monospace" }}>{c.batch}</td>
                    <td>
                      <Badge tone="info">Sem {c.semester}</Badge>
                    </td>
                    <td className="nd-cell-primary" style={{ fontFamily: "monospace" }}>{c.section}</td>
                    <td>
                      {c.advisor ? (
                        <span className="nd-cell-primary">
                          {c.advisor.user.firstName} {c.advisor.user.lastName}
                        </span>
                      ) : (
                        <Badge tone="warning">Unassigned</Badge>
                      )}
                    </td>
                    <td className="nd-cell-num">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <Users style={{ width: 13, height: 13, color: "#94a3b8" }} />
                        {c._count?.students ?? 0}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditingClassroom(c);
                          setEditData({ name: c.name, batch: c.batch, semester: c.semester, section: c.section });
                          setEditError(null);
                        }}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            unit="classrooms"
            onChange={(p) => setCurrentPage(p)}
          />
        </div>
      )}

      {showCreateModal && (
        <Modal
          title="Create classroom"
          description="Add a new classroom to your department."
          onClose={() => setShowCreateModal(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" form="create-classroom-form" disabled={createSubmitting}>
                {createSubmitting && <ButtonSpinner />}
                {createSubmitting ? "Creating…" : "Create Classroom"}
              </Button>
            </>
          }
        >
          {createError && (
            <div className="nd-alert nd-alert-error" role="alert">
              <span>{createError}</span>
            </div>
          )}
          <form id="create-classroom-form" onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input
              label="Classroom name"
              placeholder="e.g. CSE-II-A"
              required
              value={createData.name}
              onChange={(e) => setCreateData({ ...createData, name: e.target.value })}
              autoComplete="off"
            />
            <div className="nd-form-grid-3">
              <Input
                label="Batch"
                placeholder="2024-2028"
                required
                value={createData.batch}
                onChange={(e) => setCreateData({ ...createData, batch: e.target.value })}
                autoComplete="off"
              />
              <Select
                label="Semester"
                value={createData.semester}
                onChange={(e) => setCreateData({ ...createData, semester: parseInt(e.target.value, 10) })}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>
                    Sem {s}
                  </option>
                ))}
              </Select>
              <Input
                label="Section"
                placeholder="A"
                maxLength={5}
                required
                value={createData.section}
                onChange={(e) => setCreateData({ ...createData, section: e.target.value.toUpperCase() })}
                autoComplete="off"
              />
            </div>
          </form>
        </Modal>
      )}

      {editingClassroom && (
        <Modal
          title="Edit classroom"
          description={`Updating ${editingClassroom.name}.`}
          onClose={() => setEditingClassroom(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditingClassroom(null)}>
                Cancel
              </Button>
              <Button type="submit" form="edit-classroom-form" disabled={editSubmitting}>
                {editSubmitting && <ButtonSpinner />}
                {editSubmitting ? "Saving…" : "Save Changes"}
              </Button>
            </>
          }
        >
          {editError && (
            <div className="nd-alert nd-alert-error" role="alert">
              <span>{editError}</span>
            </div>
          )}
          <form id="edit-classroom-form" onSubmit={handleEditSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Input
              label="Classroom name"
              required
              value={editData.name || ""}
              onChange={(e) => setEditData({ ...editData, name: e.target.value })}
              autoComplete="off"
            />
            <div className="nd-form-grid-3">
              <Input
                label="Batch"
                required
                value={editData.batch || ""}
                onChange={(e) => setEditData({ ...editData, batch: e.target.value })}
                autoComplete="off"
              />
              <Select
                label="Semester"
                value={editData.semester ?? 1}
                onChange={(e) => setEditData({ ...editData, semester: parseInt(e.target.value, 10) })}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>
                    Sem {s}
                  </option>
                ))}
              </Select>
              <Input
                label="Section"
                required
                maxLength={5}
                value={editData.section || ""}
                onChange={(e) => setEditData({ ...editData, section: e.target.value.toUpperCase() })}
                autoComplete="off"
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
