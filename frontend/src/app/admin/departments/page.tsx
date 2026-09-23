"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  getAdminDepartments,
  getUsers,
  assignHodToDepartment,
  createHod,
  Department,
  SafeUser,
  CreateHodPayload,
} from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { RefreshCw, UserPlus, UserCheck } from "lucide-react";
import { PageHeader, Badge, Button, LinkButton } from "@/components/ui/controls";
import { TableSkeleton, EmptyState, ErrorState } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/overlays";

function AssignHodModal({
  department,
  onClose,
  onSuccess,
}: {
  department: Department;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");
  
  // New HOD form state
  const [form, setForm] = useState<CreateHodPayload>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    departmentId: department.id,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCandidateUsers() {
      try {
        setLoadingUsers(true);
        const res = await getUsers({ limit: 100, isActive: "true" });
        // Filter out current HOD if any
        setUsers(res.data.filter((u) => u.id !== department.hodUserId));
      } catch {
        // ignore
      } finally {
        setLoadingUsers(false);
      }
    }
    loadCandidateUsers();
  }, [department]);

  const handleAssignExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    setSubmitting(true);
    setError(null);
    try {
      await assignHodToDepartment(department.id, selectedUserId);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to assign HOD.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createHod(form);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create HOD.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`Assign HOD for ${department.code}`}
      description={`Set Head of Department for ${department.name}`}
      onClose={onClose}
    >
      {error && (
        <div className="nd-alert nd-alert-error" style={{ marginBottom: 14 }}>
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
        <button
          type="button"
          className={`nd-btn ${tab === "existing" ? "nd-btn-primary" : "nd-btn-secondary"}`}
          onClick={() => setTab("existing")}
          style={{ fontSize: 13, padding: "6px 14px" }}
        >
          Assign Existing User
        </button>
        <button
          type="button"
          className={`nd-btn ${tab === "new" ? "nd-btn-primary" : "nd-btn-secondary"}`}
          onClick={() => setTab("new")}
          style={{ fontSize: 13, padding: "6px 14px" }}
        >
          Create New HOD Account
        </button>
      </div>

      {tab === "existing" ? (
        <form onSubmit={handleAssignExisting} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="nd-form-label" style={{ display: "block", marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
              Select User to Promote as HOD
            </label>
            {loadingUsers ? (
              <p style={{ fontSize: 13, color: "#64748b" }}>Loading users...</p>
            ) : users.length === 0 ? (
              <p style={{ fontSize: 13, color: "#64748b" }}>No active users found to assign.</p>
            ) : (
              <select
                className="nd-select"
                style={{ width: "100%" }}
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                required
              >
                <option value="">-- Select a user --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} ({u.email}) — [{u.role}]
                  </option>
                ))}
              </select>
            )}
            <p style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
              Promotes the selected user to HOD role and sets them as Head of {department.name}.
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <Button variant="secondary" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !selectedUserId}>
              {submitting ? "Assigning…" : "Assign as HOD"}
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleCreateNew} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="nd-form-grid">
            <div>
              <label className="nd-form-label" style={{ display: "block", marginBottom: 4, fontSize: 13 }}>First Name</label>
              <input
                className="nd-input"
                required
                minLength={2}
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="e.g. Ramesh"
              />
            </div>
            <div>
              <label className="nd-form-label" style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Last Name</label>
              <input
                className="nd-input"
                required
                minLength={2}
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder="e.g. Kumar"
              />
            </div>
          </div>
          <div>
            <label className="nd-form-label" style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Email Address</label>
            <input
              className="nd-input"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="hod@institution.edu"
            />
          </div>
          <div>
            <label className="nd-form-label" style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Temporary Password</label>
            <input
              className="nd-input"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Min 8 chars with uppercase, lowercase, number"
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <Button variant="secondary" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create & Assign HOD"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigningDept, setAssigningDept] = useState<Department | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAdminDepartments();
      setDepartments(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        breadcrumb="Admin / Departments"
        title="Departments"
        description={
          loading ? "Loading departments…" : `${departments.length} department${departments.length !== 1 ? "s" : ""} in the institution`
        }
        actions={
          <>
            <Button variant="secondary" onClick={load}>
              <RefreshCw style={{ width: 14, height: 14 }} />
              Refresh
            </Button>
            <LinkButton href="/admin/hods">Manage HODs</LinkButton>
          </>
        }
      />

      {error && !loading && (
        <div className="nd-card" style={{ marginBottom: 16 }}>
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : departments.length === 0 ? (
        <div className="nd-table-card">
          <EmptyState
            title="No departments found"
            description="Departments will appear here once they are added to the institution."
          />
        </div>
      ) : (
        <div className="nd-table-card">
          <div className="nd-table-scroll">
            <table className="nd-table" data-testid="admin-departments-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Department</th>
                  <th>HOD</th>
                  <th>HOD Status</th>
                  <th>Classrooms</th>
                  <th>Students</th>
                  <th>Staff</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((dept) => (
                  <tr key={dept.id}>
                    <td>
                      <span className="nd-code">{dept.code}</span>
                    </td>
                    <td className="nd-cell-primary">{dept.name}</td>
                    <td>
                      {dept.hodUser ? (
                        <div>
                          <div className="nd-cell-primary">
                            {dept.hodUser.firstName} {dept.hodUser.lastName}
                          </div>
                          <div className="nd-cell-secondary">{dept.hodUser.email}</div>
                        </div>
                      ) : (
                        <Badge tone="warning">No HOD</Badge>
                      )}
                    </td>
                    <td>
                      {dept.hodUser ? (
                        <Badge tone={dept.hodUser.isActive ? "success" : "danger"}>
                          {dept.hodUser.isActive ? "Active" : "Inactive"}
                        </Badge>
                      ) : (
                        <span className="nd-cell-secondary">—</span>
                      )}
                    </td>
                    <td className="nd-cell-num">{dept._count?.classrooms ?? 0}</td>
                    <td className="nd-cell-num">{dept._count?.students ?? 0}</td>
                    <td className="nd-cell-num">{dept._count?.staff ?? 0}</td>
                    <td style={{ textAlign: "right" }}>
                      {dept.hodUser ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setAssigningDept(dept)}
                          aria-label={`Change HOD for ${dept.code}`}
                        >
                          <UserCheck style={{ width: 13, height: 13 }} />
                          Change HOD
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setAssigningDept(dept)}
                          aria-label={`Assign HOD for ${dept.code}`}
                        >
                          <UserPlus style={{ width: 13, height: 13 }} />
                          Assign HOD
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {assigningDept && (
        <AssignHodModal
          department={assigningDept}
          onClose={() => setAssigningDept(null)}
          onSuccess={load}
        />
      )}
    </div>
  );
}
