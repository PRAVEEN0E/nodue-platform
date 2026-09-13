"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getFinalVerifications, FinalVerificationRow } from "@/lib/advisor-api";
import { ApiError } from "@/lib/api";
import { Search, RefreshCw, CheckCircle2 } from "lucide-react";
import { PageHeader, Badge, Button } from "@/components/ui/controls";
import { TableSkeleton, EmptyState, ErrorState, Pagination } from "@/components/ui/feedback";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function AdvisorFinalVerificationPage() {
  const [students, setStudents] = useState<FinalVerificationRow[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getFinalVerifications({
        page: currentPage,
        limit: 20,
        search: search.trim() || undefined,
      });
      setStudents(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load final verification.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  return (
    <div>
      <PageHeader
        breadcrumb="Advisor / Final Verification"
        title="Final Verification"
        description="Students in your classroom whose NoDue process is complete across all subjects, advisor, HOD and fee verification. This state is derived automatically — no manual action is needed."
      />

      <div className="nd-filter-bar" role="search">
        <div className="nd-search-wrap">
          <Search className="nd-search-icon" style={{ width: 16, height: 16 }} />
          <input
            className="nd-input nd-search-input"
            placeholder="Search by name, email or register number…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            aria-label="Search completed students"
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
        <TableSkeleton rows={8} cols={4} />
      ) : students.length === 0 ? (
        <div className="nd-table-card">
          <EmptyState
            title="No completed students"
            description={
              search
                ? "No students in your classroom match this search."
                : "When a student clears all subject, advisor, HOD and fee verification steps, they appear here automatically."
            }
          />
        </div>
      ) : (
        <div className="nd-table-card">
          <div className="nd-table-scroll">
            <table className="nd-table nd-responsive-cards">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Register Number</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Verified On</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td data-label="Student">
                      <div className="nd-user-cell">
                        <div className="nd-avatar" aria-hidden="true">
                          {s.user.firstName[0]}{s.user.lastName[0]}
                        </div>
                        <div>
                          <div className="nd-cell-primary">{s.user.firstName} {s.user.lastName}</div>
                          <div className="nd-cell-secondary">{s.rollNumber ? `Roll: ${s.rollNumber}` : `Admitted ${s.admissionYear}`}</div>
                        </div>
                      </div>
                    </td>
                    <td className="nd-code" data-label="Register Number">{s.registerNumber}</td>
                    <td className="nd-cell-secondary" data-label="Email">{s.user.email}</td>
                    <td data-label="Status">
                      <Badge tone="success">
                        <CheckCircle2 style={{ width: 12, height: 12 }} />
                        COMPLETE
                      </Badge>
                    </td>
                    <td className="nd-cell-secondary" data-label="Verified On">{formatDate(s.verifiedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} unit="completed student" onChange={setCurrentPage} />
        </div>
      )}
    </div>
  );
}