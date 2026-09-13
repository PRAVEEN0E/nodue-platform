"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getHodAuditLogs, HodAuditLog, PaginationMeta } from "@/lib/hod-api";
import { ApiError } from "@/lib/api";
import { RefreshCw } from "lucide-react";
import { PageHeader, Badge, Button } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlays";
import { TableSkeleton, EmptyState, ErrorState, Pagination } from "@/components/ui/feedback";

function actionTone(action: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (action.includes("CREATED")) return "success";
  if (action.includes("UPDATED") || action.includes("ASSIGNED")) return "info";
  if (action.includes("UNASSIGNED")) return "warning";
  return "neutral";
}

export default function HodAuditLogsPage() {
  const [logs, setLogs] = useState<HodAuditLog[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, page: 1, limit: 15, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedLog, setSelectedLog] = useState<HodAuditLog | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getHodAuditLogs({
        page: currentPage,
        limit: 15,
        action: actionFilter || undefined,
        entityType: entityFilter || undefined,
      });
      setLogs(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load department audit logs.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, actionFilter, entityFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div>
      <PageHeader
        breadcrumb="HOD / Audit Logs"
        title="Department Audit Logs"
        description="Activity and security trail scoped strictly to your department."
        actions={
          <Button variant="secondary" onClick={fetchLogs}>
            <RefreshCw style={{ width: 14, height: 14 }} />
            Refresh
          </Button>
        }
      />

      <div className="nd-filter-bar">
        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="nd-select"
          style={{ width: "auto", minWidth: 190 }}
          aria-label="Filter by action"
        >
          <option value="">All Actions</option>
          <option value="CLASSROOM_CREATED">Classroom Created</option>
          <option value="CLASSROOM_UPDATED">Classroom Updated</option>
          <option value="ADVISOR_CREATED">Advisor Created</option>
          <option value="ADVISOR_ASSIGNED">Advisor Assigned</option>
          <option value="ADVISOR_UNASSIGNED">Advisor Unassigned</option>
          <option value="USER_STATUS_UPDATED">User Status Updated</option>
          <option value="DEPARTMENT_UPDATED">Department Updated</option>
        </select>
        <select
          value={entityFilter}
          onChange={(e) => {
            setEntityFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="nd-select"
          style={{ width: "auto", minWidth: 170 }}
          aria-label="Filter by entity type"
        >
          <option value="">All Entity Types</option>
          <option value="Classroom">Classroom</option>
          <option value="Advisor">Advisor</option>
          <option value="User">User</option>
          <option value="Department">Department</option>
        </select>
      </div>

      {error && !loading && (
        <div className="nd-card" style={{ marginBottom: 16 }}>
          <ErrorState message={error} onRetry={fetchLogs} />
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : logs.length === 0 ? (
        <div className="nd-table-card">
          <EmptyState
            title="No audit records found"
            description="No audit records match the current filters for your department."
          />
        </div>
      ) : (
        <div className="nd-table-card">
          <div className="nd-table-scroll">
            <table className="nd-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Actor</th>
                  <th>IP Address</th>
                  <th>Timestamp</th>
                  <th style={{ textAlign: "right" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <Badge tone={actionTone(log.action)}>{log.action.replace(/_/g, " ")}</Badge>
                    </td>
                    <td>
                      <div className="nd-cell-primary">{log.entityType}</div>
                      {log.entityId && (
                        <div className="nd-cell-secondary" style={{ fontFamily: "monospace", fontSize: 11 }}>
                          #{log.entityId.slice(0, 8)}
                        </div>
                      )}
                    </td>
                    <td>
                      {log.actorUser ? (
                        <div>
                          <div className="nd-cell-primary">
                            {log.actorUser.firstName} {log.actorUser.lastName}
                          </div>
                          <div className="nd-cell-secondary">
                            {log.actorUser.role} · {log.actorUser.email}
                          </div>
                        </div>
                      ) : (
                        <span className="nd-cell-secondary">System</span>
                      )}
                    </td>
                    <td className="nd-cell-secondary" style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {log.ipAddress || "—"}
                    </td>
                    <td className="nd-cell-secondary" style={{ whiteSpace: "nowrap" }}>
                      {new Date(log.createdAt).toLocaleDateString()}{" "}
                      {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                        View
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
            unit="records"
            onChange={(p) => setCurrentPage(p)}
          />
        </div>
      )}

      {selectedLog && (
        <Modal
          title={selectedLog.action.replace(/_/g, " ")}
          description={`Record ${selectedLog.id.slice(0, 8)} · ${new Date(selectedLog.createdAt).toLocaleString()}`}
          onClose={() => setSelectedLog(null)}
          maxWidth={560}
          footer={
            <Button variant="secondary" onClick={() => setSelectedLog(null)}>
              Close
            </Button>
          }
        >
          <div>
            <div className="nd-def-row">
              <span className="nd-def-label">Entity</span>
              <span className="nd-def-value">
                {selectedLog.entityType} ({selectedLog.entityId?.slice(0, 8) ?? "—"})
              </span>
            </div>
            <div className="nd-def-row">
              <span className="nd-def-label">Actor</span>
              <span className="nd-def-value">
                {selectedLog.actorUser
                  ? `${selectedLog.actorUser.firstName} ${selectedLog.actorUser.lastName} · ${selectedLog.actorUser.role}`
                  : "System"}
              </span>
            </div>
          </div>
          <div>
            <span className="nd-label">Event data</span>
            <pre className="nd-pre">{JSON.stringify(selectedLog.metadata, null, 2) || "{}"}</pre>
          </div>
        </Modal>
      )}
    </div>
  );
}
