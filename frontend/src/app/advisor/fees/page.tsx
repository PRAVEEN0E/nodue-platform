"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  getFeeVerifications,
  approveStudentFeeVerification,
  FeeVerificationRow,
} from "@/lib/advisor-api";
import { ApiError } from "@/lib/api";
import { Search, RefreshCw, Check } from "lucide-react";
import { PageHeader, Badge, Button } from "@/components/ui/controls";
import { TableSkeleton, EmptyState, ErrorState, Pagination, ButtonSpinner } from "@/components/ui/feedback";

export default function AdvisorFeeVerificationPage() {
  const [rows, setRows] = useState<FeeVerificationRow[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [approving, setApproving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getFeeVerifications({
        page: currentPage,
        limit: 20,
        search: search.trim() || undefined,
        status: (statusFilter as "PENDING" | "VERIFIED" | undefined) || undefined,
      });
      setRows(res.data);
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

  const handleApprove = async (row: FeeVerificationRow) => {
    setApproving(row.studentId);
    setError(null);
    try {
      await approveStudentFeeVerification(row.studentId);
      setNotice(`${row.studentName} fee verification approved. No HOD approval needed.`);
      setTimeout(() => setNotice(null), 5000);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to verify fee.");
    } finally {
      setApproving(null);
    }
  };

  const allVerified = rows.length > 0 && rows.every((r) => r.verified);

  return (
    <div>
      <PageHeader
        breadcrumb="Advisor / Fee Verification"
        title="Fee Verification"
        description="Verify fees for students in your assigned classroom. Your approval alone verifies the fee."
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
            placeholder="Search by student name or register number…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            aria-label="Search students"
          />
        </div>
        <select
          className="nd-select" style={{ width: "auto", minWidth: 130 }}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
          aria-label="Filter by verification status"
        >
          <option value="">All</option>
          <option value="PENDING">Pending</option>
          <option value="VERIFIED">Verified</option>
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
            title="No students found"
            description="Students in your assigned classroom will appear here."
          />
        </div>
      ) : allVerified ? (
        <div className="nd-table-card">
          <EmptyState
            title="All students verified"
            description="Every student in your classroom has a verified fee status."
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
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const busy = approving === r.studentId;
                  return (
                    <tr key={r.studentId}>
                      <td>
                        <div className="nd-user-cell">
                          <div className="nd-avatar" aria-hidden="true">
                            {r.studentName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                          </div>
                          <span className="nd-cell-primary">{r.studentName}</span>
                        </div>
                      </td>
                      <td className="nd-cell-secondary" style={{ fontFamily: "monospace", fontSize: 12.5 }}>
                        {r.registerNumber}
                      </td>
                      <td>
                        {r.verified ? (
                          <Badge tone="success">Verified</Badge>
                        ) : (
                          <Badge tone="warning">Pending</Badge>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {!r.verified && (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={busy}
                            onClick={() => handleApprove(r)}
                            aria-label={`Approve fee verification for ${r.studentName}`}
                          >
                            {busy && <ButtonSpinner />}
                            {busy ? "Approving…" : "Approve"}
                          </Button>
                        )}
                        {r.verified && (
                          <span className="nd-cell-secondary" style={{ fontSize: 12.5 }}>✓ Verified</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} unit="students" onChange={setCurrentPage} />
        </div>
      )}
    </div>
  );
}