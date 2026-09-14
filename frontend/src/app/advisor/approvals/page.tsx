"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  getAdvisorApprovals,
  decideAdvisorApproval,
  AdvisorPendingRow,
  AdvisorDecidedRow,
  AdvisorQueueStatus,
} from "@/lib/advisor-api";
import { ApiError } from "@/lib/api";
import { Search, RefreshCw, Check, X } from "lucide-react";
import { PageHeader, Badge, Button, Input } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlays";
import { TableSkeleton, EmptyState, ErrorState, Pagination, ButtonSpinner } from "@/components/ui/feedback";  import { StatusBadge } from "@/components/ui/status";

type Row = AdvisorPendingRow | AdvisorDecidedRow;

function isDecided(row: Row): row is AdvisorDecidedRow {
  return row.status !== "PENDING";
}

export default function AdvisorApprovalsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdvisorQueueStatus>("pending");
  const [currentPage, setCurrentPage] = useState(1);

  const [acting, setActing] = useState<AdvisorPendingRow | null>(null);
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [remarks, setRemarks] = useState("");
  const [remarksError, setRemarksError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdvisorApprovals({
        page: currentPage,
        limit: 20,
        search: search.trim() || undefined,
        status: statusFilter,
      });
      setRows(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load approvals.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const openDecision = (row: AdvisorPendingRow, d: "APPROVED" | "REJECTED") => {
    setActing(row);
    setDecision(d);
    setRemarks("");
    setRemarksError(null);
  };

  const handleDecide = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!acting) return;
    if (decision === "REJECTED" && remarks.trim().length === 0) {
      setRemarksError("Please provide a reason for rejection.");
      return;
    }
    setSubmitting(true);
    try {
      await decideAdvisorApproval({
        studentId: acting.student.id,
        decision,
        remarks: remarks.trim() || null,
      });
      setActing(null);
      setNotice(
        `${acting.student.user.firstName} ${acting.student.user.lastName} ${decision === "APPROVED" ? "approved" : "rejected"}.`
      );
      setTimeout(() => setNotice(null), 5000);
      load();
    } catch (err) {
      setRemarksError(err instanceof ApiError ? err.message : "Failed to record decision.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb="Advisor / Approvals"
        title="Student Approvals"
        description="Students with all subjects staff-approved become available for your review."
        actions={
          <Button variant="secondary" onClick={load}>
            <RefreshCw style={{ width: 14, height: 14 }} />
            Refresh
          </Button>
        }
      />

      {notice && (
        <div className="nd-alert nd-alert-success" role="status">
          <Check style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span>{notice}</span>
        </div>
      )}

      <div className="nd-filter-bar" role="search">
        <div className="nd-search-wrap">
          <Search className="nd-search-icon" style={{ width: 16, height: 16 }} />
          <input
            className="nd-input nd-search-input"
            placeholder="Search by student name or register number..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            aria-label="Search approvals"
          />
        </div>
        <select
          className="nd-select" style={{ width: "auto", minWidth: 150 }}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as AdvisorQueueStatus); setCurrentPage(1); }}
          aria-label="Filter by decision status"
        >
          <option value="pending">Pending review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="decided">All decided</option>
        </select>
      </div>

      {error && !loading && (
        <div className="nd-card" style={{ marginBottom: 16 }}>
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={8} cols={4} />
      ) : rows.length === 0 ? (
        <div className="nd-table-card">
          <EmptyState
            title={statusFilter === "pending" ? "No students awaiting review" : "No records found"}
            description={
              statusFilter === "pending"
                ? "Students appear here once all of their subjects are staff-approved."
                : "No approval records match the current filters."
            }
          />
        </div>
      ) : (
        <div className="nd-table-card">
          <div className="nd-table-scroll">
            <table className="nd-table" data-testid="advisor-approvals-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Subjects</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Decision</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const key = isDecided(row) ? row.id : row.student.id;
                  return (
                    <tr key={key}>
                      <td>
                        <div className="nd-user-cell">
                          <div className="nd-avatar" aria-hidden="true">
                            {row.student.user.firstName[0]}{row.student.user.lastName[0]}
                          </div>
                          <div>
                            <div className="nd-cell-primary">
                              {row.student.user.firstName} {row.student.user.lastName}
                            </div>
                            <div className="nd-cell-secondary" style={{ fontFamily: "monospace", fontSize: 11.5 }}>
                              {row.student.registerNumber}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="nd-cell-secondary">
                        {!isDecided(row)
                          ? row.subjects.map((s) => s.code).join(", ")
                          : "—"}
                      </td>
                      <td>
<StatusBadge status={row.status} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {isDecided(row) ? (
                          <span className="nd-cell-secondary" style={{ fontSize: 12.5 }}>
                            {new Date(row.updatedAt).toLocaleDateString("en-IN")}
                          </span>
                        ) : (
                          <div style={{ display: "inline-flex", gap: 6 }}>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => openDecision(row, "APPROVED")}
                              aria-label={`Approve ${row.student.user.firstName}`}
                              data-testid="advisor-approval-action"
                            >
                              <Check style={{ width: 13, height: 13 }} />
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => openDecision(row, "REJECTED")}
                              aria-label={`Reject ${row.student.user.firstName}`}
                            >
                              <X style={{ width: 13, height: 13 }} />
                              Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} unit="records" onChange={setCurrentPage} />
        </div>
      )}

      {acting && (
        <Modal
          title={`Confirm ${decision === "APPROVED" ? "approval" : "rejection"}`}
          description={`${acting.student.user.firstName} ${acting.student.user.lastName} (${acting.student.registerNumber}) · ${acting.subjects.length} subject${acting.subjects.length !== 1 ? "s" : ""} staff-approved`}
          onClose={() => setActing(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setActing(null)}>Cancel</Button>
              <Button
                type="submit"
                form="advisor-decision-form"
                variant={decision === "APPROVED" ? "primary" : "danger"}
                disabled={submitting}
              >
                {submitting && <ButtonSpinner />}
                {submitting ? "Saving..." : decision === "APPROVED" ? "Confirm Approval" : "Confirm Rejection"}
              </Button>
            </>
          }
        >
          <form id="advisor-decision-form" onSubmit={handleDecide} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 8 }} role="group" aria-label="Decision">
              <Button
                type="button"
                variant={decision === "APPROVED" ? "primary" : "secondary"}
                onClick={() => { setDecision("APPROVED"); setRemarksError(null); }}
              >
                <Check style={{ width: 14, height: 14 }} /> Approve
              </Button>
              <Button
                type="button"
                variant={decision === "REJECTED" ? "danger" : "secondary"}
                onClick={() => { setDecision("REJECTED"); setRemarksError(null); }}
              >
                <X style={{ width: 14, height: 14 }} /> Reject
              </Button>
            </div>
            <Input
              label={decision === "REJECTED" ? "Rejection reason (required)" : "Remarks (optional)"}
              placeholder={decision === "REJECTED" ? "e.g. Attendance below requirement" : "Optional note"}
              value={remarks}
              maxLength={500}
              onChange={(e) => { setRemarks(e.target.value); setRemarksError(null); }}
              error={remarksError ?? undefined}
              autoComplete="off"
            />
          </form>
        </Modal>
      )}
    </div>
  );
}
