"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  getHodAdvisors,
  createAdvisor,
  updateAdvisor,
  assignAdvisorClassroom,
  getHodClassrooms,
  AdvisorUser,
  Classroom,
  CreateAdvisorPayload,
  PaginationMeta,
} from "@/lib/hod-api";
import { ApiError } from "@/lib/api";
import { Plus, Search, RefreshCw, GraduationCap } from "lucide-react";
import { PageHeader, Badge, Button, Input, Select } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlays";
import { TableSkeleton, EmptyState, ErrorState, Pagination, ButtonSpinner } from "@/components/ui/feedback";

export default function HodAdvisorsPage() {
  const [advisors, setAdvisors] = useState<AdvisorUser[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createData, setCreateData] = useState<CreateAdvisorPayload>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    classroomId: null,
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [assigningAdvisor, setAssigningAdvisor] = useState<AdvisorUser | null>(null);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const [editingAdvisor, setEditingAdvisor] = useState<AdvisorUser | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [advRes, clsRes] = await Promise.all([
        getHodAdvisors({
          page: currentPage,
          limit: 10,
          search: search.trim() || undefined,
          isActive: statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined,
        }),
        getHodClassrooms({ page: 1, limit: 100 }),
      ]);
      setAdvisors(advRes.data);
      setMeta(advRes.meta);
      setClassrooms(clsRes.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to fetch advisors.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      await createAdvisor({
        firstName: createData.firstName.trim(),
        lastName: createData.lastName.trim(),
        email: createData.email.trim().toLowerCase(),
        password: createData.password,
        classroomId: createData.classroomId || null,
      });
      setShowCreateModal(false);
      setCreateData({ firstName: "", lastName: "", email: "", password: "", classroomId: null });
      fetchData();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Failed to create advisor.");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningAdvisor) return;
    setAssignSubmitting(true);
    setAssignError(null);
    try {
      await assignAdvisorClassroom(assigningAdvisor.id, selectedClassroomId ? selectedClassroomId : null);
      setAssigningAdvisor(null);
      fetchData();
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : "Failed to assign classroom.");
    } finally {
      setAssignSubmitting(false);
    }
  };

  const handleToggleStatus = async (advisor: AdvisorUser) => {
    setNotice(null);
    try {
      await updateAdvisor(advisor.id, { isActive: !advisor.isActive });
      fetchData();
    } catch {
      setNotice(`Could not update status for ${advisor.firstName} ${advisor.lastName}. Please try again.`);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdvisor) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await updateAdvisor(editingAdvisor.id, {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
      });
      setEditingAdvisor(null);
      fetchData();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Failed to update advisor.");
    } finally {
      setEditSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb="HOD / Advisors"
        title="Advisors"
        description="Create department advisors and assign them to supervise classrooms."
        actions={
          <Button
            onClick={() => {
              setCreateError(null);
              setShowCreateModal(true);
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            New Advisor
          </Button>
        }
      />

      <div className="nd-filter-bar" role="search">
        <div className="nd-search-wrap">
          <Search className="nd-search-icon" style={{ width: 16, height: 16 }} />
          <input
            type="text"
            placeholder="Search by advisor name or email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="nd-input nd-search-input"
            aria-label="Search advisors"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="nd-select"
          style={{ width: "auto", minWidth: 150 }}
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
        <Button variant="secondary" onClick={fetchData} aria-label="Refresh list">
          <RefreshCw style={{ width: 14, height: 14 }} />
        </Button>
      </div>

      {notice && (
        <div className="nd-alert nd-alert-error" role="alert">
          <span>{notice}</span>
        </div>
      )}

      {error && !loading && (
        <div className="nd-card" style={{ marginBottom: 16 }}>
          <ErrorState message={error} onRetry={fetchData} />
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : advisors.length === 0 ? (
        <div className="nd-table-card">
          <EmptyState
            title="No advisors found"
            description="Create an advisor account to start assigning faculty guides to department classrooms."
            action={
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus style={{ width: 14, height: 14 }} />
                Create Advisor
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
                  <th>Advisor</th>
                  <th>Email</th>
                  <th>Assigned Classroom</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {advisors.map((a) => {
                  const assignedClass = a.advisorProfile?.classroom;
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className="nd-user-cell">
                          <div className="nd-avatar" aria-hidden="true">
                            {a.firstName[0]}
                            {a.lastName[0]}
                          </div>
                          <span className="nd-cell-primary">
                            {a.firstName} {a.lastName}
                          </span>
                        </div>
                      </td>
                      <td className="nd-cell-secondary" style={{ fontFamily: "monospace", fontSize: 12.5 }}>{a.email}</td>
                      <td>
                        {assignedClass ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#1d4ed8" }}>
                            <GraduationCap style={{ width: 14, height: 14 }} />
                            {assignedClass.name} (Sem {assignedClass.semester}-{assignedClass.section})
                          </span>
                        ) : (
                          <Badge tone="warning">Unassigned</Badge>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => handleToggleStatus(a)}
                          className={`nd-badge ${a.isActive ? "nd-badge-success" : "nd-badge-danger"}`}
                          title={a.isActive ? "Deactivate advisor" : "Activate advisor"}
                          style={{ cursor: "pointer" }}
                        >
                          <span className="nd-badge-dot" aria-hidden="true" />
                          {a.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setAssigningAdvisor(a);
                              setSelectedClassroomId(a.advisorProfile?.classroomId || "");
                              setAssignError(null);
                            }}
                          >
                            Map Class
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditingAdvisor(a);
                              setEditFirstName(a.firstName);
                              setEditLastName(a.lastName);
                              setEditError(null);
                            }}
                          >
                            Edit
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            unit="advisors"
            onChange={(p) => setCurrentPage(p)}
          />
        </div>
      )}

      {showCreateModal && (
        <Modal
          title="Create advisor"
          description="Add a faculty advisor to your department, optionally mapped to a classroom."
          onClose={() => setShowCreateModal(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" form="create-advisor-form" disabled={createSubmitting}>
                {createSubmitting && <ButtonSpinner />}
                {createSubmitting ? "Creating…" : "Create Advisor"}
              </Button>
            </>
          }
        >
          {createError && (
            <div className="nd-alert nd-alert-error" role="alert">
              <span>{createError}</span>
            </div>
          )}
          <form id="create-advisor-form" onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="nd-form-grid">
              <Input
                label="First name"
                placeholder="Alan"
                required
                value={createData.firstName}
                onChange={(e) => setCreateData({ ...createData, firstName: e.target.value })}
                autoComplete="given-name"
              />
              <Input
                label="Last name"
                placeholder="Turing"
                required
                value={createData.lastName}
                onChange={(e) => setCreateData({ ...createData, lastName: e.target.value })}
                autoComplete="family-name"
              />
            </div>
            <Input
              label="Email"
              type="email"
              placeholder="advisor@institution.edu"
              required
              value={createData.email}
              onChange={(e) => setCreateData({ ...createData, email: e.target.value })}
              autoComplete="email"
            />
            <Input
              label="Initial password"
              type="password"
              placeholder="Min 8 characters, uppercase and number"
              required
              minLength={8}
              value={createData.password}
              onChange={(e) => setCreateData({ ...createData, password: e.target.value })}
              autoComplete="new-password"
              hint="Must contain an uppercase letter, a lowercase letter, and a number."
            />
            <Select
              label="Assign classroom (optional)"
              value={createData.classroomId || ""}
              onChange={(e) => setCreateData({ ...createData, classroomId: e.target.value ? e.target.value : null })}
            >
              <option value="">Do not assign yet</option>
              {classrooms.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} (Batch {cls.batch}, Sem {cls.semester}-{cls.section})
                </option>
              ))}
            </Select>
          </form>
        </Modal>
      )}

      {assigningAdvisor && (
        <Modal
          title="Map classroom"
          description={`Assign a classroom to ${assigningAdvisor.firstName} ${assigningAdvisor.lastName}.`}
          onClose={() => setAssigningAdvisor(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAssigningAdvisor(null)}>
                Cancel
              </Button>
              <Button type="submit" form="assign-classroom-form" disabled={assignSubmitting}>
                {assignSubmitting && <ButtonSpinner />}
                {assignSubmitting ? "Saving…" : "Save Assignment"}
              </Button>
            </>
          }
        >
          {assignError && (
            <div className="nd-alert nd-alert-error" role="alert">
              <span>{assignError}</span>
            </div>
          )}
          <form id="assign-classroom-form" onSubmit={handleAssignSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Select
              label="Department classroom"
              value={selectedClassroomId}
              onChange={(e) => setSelectedClassroomId(e.target.value)}
            >
              <option value="">Unassigned — no classroom</option>
              {classrooms.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} (Batch {cls.batch}, Sem {cls.semester}-{cls.section})
                  {cls.advisor ? ` — ${cls.advisor.user.firstName}` : " — vacant"}
                </option>
              ))}
            </Select>
            <p className="nd-hint">Assigning to an occupied classroom will safely reassign the role.</p>
          </form>
        </Modal>
      )}

      {editingAdvisor && (
        <Modal
          title="Edit advisor"
          description="Update the advisor's name."
          onClose={() => setEditingAdvisor(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditingAdvisor(null)}>
                Cancel
              </Button>
              <Button type="submit" form="edit-advisor-form" disabled={editSubmitting}>
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
          <form id="edit-advisor-form" onSubmit={handleEditSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="nd-form-grid">
              <Input
                label="First name"
                required
                value={editFirstName}
                onChange={(e) => setEditFirstName(e.target.value)}
                autoComplete="given-name"
              />
              <Input
                label="Last name"
                required
                value={editLastName}
                onChange={(e) => setEditLastName(e.target.value)}
                autoComplete="family-name"
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
