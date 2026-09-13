"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  getHodClassrooms,
  getFeeVerifications,
  approveStudentFeeVerification,
  Classroom,
  FeeVerificationRow,
} from "@/lib/hod-api";
import { ApiError } from "@/lib/api";
import { Search, RefreshCw, Check, ArrowLeft, GraduationCap } from "lucide-react";
import { PageHeader, Badge, Button } from "@/components/ui/controls";
import { TableSkeleton, EmptyState, ErrorState, ButtonSpinner } from "@/components/ui/feedback";

export default function HodFeeVerificationPage() {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selected, setSelected] = useState<Classroom | null>(null);
  const [rows, setRows] = useState<FeeVerificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [approving, setApproving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadClassrooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getHodClassrooms({ page: 1, limit: 100 });
      setClassrooms(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load classrooms.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selected) loadClassrooms();
  }, [selected, loadClassrooms]);

  const loadStudents = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getFeeVerifications({
        page: 1,
        limit: 100,
        search: search.trim() || undefined,
        status: (statusFilter as "PENDING" | "VERIFIED" | undefined) || undefined,
        classroomId: selected.id,
      });
      setRows(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load students.");
    } finally {
      setLoading(false);
    }
  }, [selected, search, statusFilter]);

  useEffect(() => {
    if (!selected) return;
    const t = setTimeout(loadStudents, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadStudents, search, selected]);

  const handleApprove = async (row: FeeVerificationRow) => {
    setApproving(row.studentId);
    setError(null);
    try {
      await approveStudentFeeVerification(row.studentId);
      setNotice(`${row.studentName} fee verification approved. No advisor approval needed.`);
      setTimeout(() => setNotice(null), 5000);
      loadStudents();
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
        breadcrumb={selected ? "HOD / Fees / Classroom" : "HOD / Fees"}
        title="Fee Verification"
        description={
          selected
            ? `Students in ${selected.name}. Your approval alone verifies the fee.`
            : "Select a classroom to verify student fees."
        }
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            {selected && (
              <Button variant="secondary" onClick={() => { setSelected(null); setSearch(""); setStatusFilter(""); }}>
                <ArrowLeft style={{ width: 14, height: 14 }} />
                Classrooms
              </Button>
            )}
            <Button variant="secondary" onClick={() => (selected ? loadStudents() : loadClassrooms())}>
              <RefreshCw style={{ width: 14, height: 14 }} />
              Refresh
            </Button>
          </div>
        }
      />

      {notice && (
        <div className="nd-alert nd-alert-success" role="status">
          <Check style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span>{notice}</span>
        </div>
      )}

      {error && !loading && (
        <div className="nd-card" style={{ marginBottom: 16 }}>
          <ErrorState message={error} onRetry={() => (selected ? loadStudents() : loadClassrooms())} />
        </div>
      )}

      {!selected ? (
        loading ? (
          <TableSkeleton rows={4} cols={3} />
        ) : classrooms.length === 0 ? (
          <div className="nd-table-card">
            <EmptyState
              title="No classrooms found"
              description="Classrooms in your department will appear here."
            />
          </div>
        ) : (
          <div className="nd-stat-grid nd-stat-grid--3">
            {classrooms.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c)}
                className="nd-card"
                style={{ textAlign: "left", cursor: "pointer", padding: 20 }}
                aria-label={`Open fee verification for ${c.name}`}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="nd-stat-icon">
                    <GraduationCap style={{ width: 17, height: 17 }} />
                  </span>
                  <div>
                    <div className="nd-card-title">{c.name}</div>
                    <div className="nd-card-desc">
                      {(c._count?.students ?? 0) === 0
                        ? "No students"
                        : `${c._count?.students ?? 0} Students`}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="nd-filter-bar" role="search">
            <div className="nd-search-wrap">
              <Search className="nd-search-icon" style={{ width: 16, height: 16 }} />
              <input
                className="nd-input nd-search-input"
                placeholder="Search students in this classroom…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search students"
              />
            </div>
            <select
              className="nd-select" style={{ width: "auto", minWidth: 130 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by verification status"
            >
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="VERIFIED">Verified</option>
            </select>
          </div>

          {loading ? (
            <TableSkeleton rows={6} cols={4} />
          ) : rows.length === 0 ? (
            <div className="nd-table-card">
              <EmptyState
                title="No students in this classroom"
                description="Students enrolled in this classroom will appear here."
              />
            </div>
          ) : allVerified ? (
            <div className="nd-table-card">
              <EmptyState title="All students verified" description="Every student in this classroom has a verified fee status." />
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
              <div className="nd-pagination">
                <span className="nd-pagination-info">
                  Showing students in {selected.name}. Your approval alone verifies a fee.
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}