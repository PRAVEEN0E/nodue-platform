"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getAdminDepartments, Department } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { RefreshCw } from "lucide-react";
import { PageHeader, Badge, Button, LinkButton } from "@/components/ui/controls";
import { TableSkeleton, EmptyState, ErrorState } from "@/components/ui/feedback";

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <TableSkeleton rows={6} cols={5} />
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
