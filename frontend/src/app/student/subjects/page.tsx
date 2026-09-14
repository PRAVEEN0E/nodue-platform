"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getStudentSubjects, StudentSubject } from "@/lib/student-api";
import { ApiError } from "@/lib/api";
import { Search, RefreshCw } from "lucide-react";
import { PageHeader, Card, Button } from "@/components/ui/controls";
import { StatusBadge } from "@/components/ui/status";
import { TableSkeleton, EmptyState, ErrorState, Pagination } from "@/components/ui/feedback";

function DecisionBadge({ status }: { status: "PENDING" | "APPROVED" | "REJECTED" }) {
  return <StatusBadge status={status} />;
}

export default function StudentSubjectsPage() {
  const [subjects, setSubjects] = useState<StudentSubject[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStudentSubjects({
        page: currentPage,
        limit: 20,
        search: search.trim() || undefined,
        semester: semesterFilter ? Number(semesterFilter) : undefined,
      });
      setSubjects(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load subjects.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, semesterFilter]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  return (
    <div data-testid="student-subjects">
      <PageHeader
        breadcrumb="Student / Subjects"
        title="My Subjects"
        description="Subjects in your classroom with staff and approval status."
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
            placeholder="Search by subject name or code..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            aria-label="Search subjects"
          />
        </div>
        <select
          className="nd-select" style={{ width: "auto", minWidth: 150 }}
          value={semesterFilter}
          onChange={(e) => { setSemesterFilter(e.target.value); setCurrentPage(1); }}
          aria-label="Filter by semester"
        >
          <option value="">All Semesters</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
            <option key={s} value={s}>Semester {s}</option>
          ))}
        </select>
      </div>

      {error && !loading && (
        <div className="nd-card" style={{ marginBottom: 16 }}>
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : subjects.length === 0 ? (
        <div className="nd-table-card">
          <EmptyState
            title="No subjects assigned yet"
            description="Subjects for your classroom will appear here once they are created."
          />
        </div>
      ) : (
        <div className="nd-table-card">
          <div className="nd-table-scroll">
            <table className="nd-table" data-testid="student-subjects-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Subject</th>
                  <th>Staff</th>
                  <th>Approval Status</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((s) => {
                  const decision = s.approvals[0]?.status ?? "PENDING";
                  return (
                    <tr key={s.id}>
                      <td><span className="nd-code">{s.code}</span></td>
                      <td>
                        <div className="nd-cell-primary">{s.name}</div>
                        <div className="nd-cell-secondary">Sem {s.semester} · {s.credits} credits</div>
                      </td>
                      <td className="nd-cell-secondary">
                        {s.subjectStaff.length === 0
                          ? "—"
                          : s.subjectStaff.map((m) => `${m.staff.user.firstName} ${m.staff.user.lastName}`).join(", ")}
                      </td>
                      <td><DecisionBadge status={decision} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} unit="subjects" onChange={setCurrentPage} />
        </div>
      )}
    </div>
  );
}
