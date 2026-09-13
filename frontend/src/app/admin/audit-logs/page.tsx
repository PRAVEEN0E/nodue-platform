"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getAuditLogs, AuditLog, PaginationMeta } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { Search, RefreshCw } from "lucide-react";
import { PageHeader, Badge, Button } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlays";
import { TableSkeleton, EmptyState, ErrorState, Pagination } from "@/components/ui/feedback";

function actionTone(action: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (action.includes("CREATED") || action.includes("ACTIVATED") || action === "LOGIN_SUCCESS") return "success";
  if (action.includes("DEACTIVATED")) return "warning";
  if (action.includes("FAILED")) return "danger";
  if (action.includes("UPDATED") || action.includes("ASSIGNED")) return "info";
  return "neutral";
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState("");
  const [filterEntityType, setFilterEntityType] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const LIMIT = 25;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getAuditLogs({
        page,
        limit: LIMIT,
        action: filterAction || undefined,
        entityType: filterEntityType || undefined,
      });
      setLogs(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [page, filterAction, filterEntityType]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFilterChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setPage(1);
    setter(e.target.value);
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

  return (
    <div>
      <PageHeader
        breadcrumb="Admin / Audit Logs"
        title="Audit Logs"
        description={meta ? `${meta.total.toLocaleString()} recorded events` : "Loading…"}
        actions={
          <Button variant="secondary" onClick={load}>
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
            placeholder="Filter by action (e.g. HOD_CREATED)…"
            value={filterAction}
            onChange={handleFilterChange(setFilterAction)}
            aria-label="Filter by action"
          />
        </div>
        <div className="nd-search-wrap">
          <Search className="nd-search-icon" style={{ width: 16, height: 16 }} />
          <input
            className="nd-input nd-search-input"
            placeholder="Filter by entity type (e.g. User)…"
            value={filterEntityType}
            onChange={handleFilterChange(setFilterEntityType)}
            aria-label="Filter by entity type"
          />
        </div>
      </div>

      {error && !loading && (
        <div className="nd-card" style={{ marginBottom: 16 }}>
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : logs.length === 0 ? (
        <div className="nd-table-card">
          <EmptyState
            title="No audit entries found"
            description="System events will appear here once activity is recorded."
          />
        </div>
      ) : (
        <div className="nd-table-card">
          <div className="nd-table-scroll">
            <table className="nd-table" data-testid="admin-audit-table">
              <thead>
                <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Actor</th>
                    <th>Department</th>
                    <th>IP Address</th>
                    <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="nd-cell-secondary" style={{ whiteSpace: "nowrap" }}>
                      {formatDate(log.createdAt)}
                    </td>
                    <td>
                      <Badge tone={actionTone(log.action)}>{log.action.replace(/_/g, " ")}</Badge>
                    </td>
                    <td>
                      {log.entityType ? (
                        <div>
                          <div className="nd-cell-primary">{log.entityType}</div>
                          {log.entityId && (
                            <div className="nd-cell-secondary" style={{ fontFamily: "monospace", fontSize: 11 }}>
                              {log.entityId.slice(0, 8)}…
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="nd-cell-secondary">—</span>
                      )}
                    </td>
                    <td>
                      {log.actorUser ? (
                        <div>
                          <div className="nd-cell-primary">
                            {log.actorUser.firstName} {log.actorUser.lastName}
                          </div>
                          <div className="nd-cell-secondary">{log.actorUser.role}</div>
                        </div>
                      ) : (
                        <span className="nd-cell-secondary">System</span>
                      )}
                    </td>
                    <td>
                      {log.department ? (
                        <span className="nd-code">{log.department.code}</span>
                      ) : (
                        <span className="nd-cell-secondary">—</span>
                      )}
                    </td>
                    <td className="nd-cell-secondary" style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {log.ipAddress ?? "—"}
                    </td>
                    <td>
                      {log.metadata && Object.keys(log.metadata).length > 0 ? (
                        <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                          View
                        </Button>
                      ) : (
                        <span className="nd-cell-secondary">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {meta && (
            <Pagination
              page={meta.page}
              totalPages={meta.totalPages}
              total={meta.total}
              unit="events"
              onChange={(p) => setPage(p)}
            />
          )}
        </div>
      )}

      {selectedLog && (
        <Modal
          title="Event details"
          description={`${selectedLog.action.replace(/_/g, " ")} · ${formatDate(selectedLog.createdAt)}`}
          onClose={() => setSelectedLog(null)}
          maxWidth={560}
          footer={
            <Button variant="secondary" onClick={() => setSelectedLog(null)}>
              Close
            </Button>
          }
        >
          <pre className="nd-pre">{JSON.stringify(selectedLog.metadata, null, 2)}</pre>
        </Modal>
      )}
    </div>
  );
}
