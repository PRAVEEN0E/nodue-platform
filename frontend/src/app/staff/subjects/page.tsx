"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getStaffSubjects, StaffSubject } from "@/lib/staff-api";
import { ApiError } from "@/lib/api";
import { Search, RefreshCw, ArrowRight } from "lucide-react";
import { PageHeader, Button } from "@/components/ui/controls";
import { TableSkeleton, EmptyState, ErrorState, Pagination } from "@/components/ui/feedback";

interface SubjectGroup {
  key: string;
  name: string;
  sub: string;
  rows: StaffSubject[];
}

function groupByClassroom(subjects: StaffSubject[]): SubjectGroup[] {
  const byClass = new Map<string, SubjectGroup>();
  for (const s of subjects) {
    const key = s.classroom?.id ?? "none";
    if (!byClass.has(key)) {
      byClass.set(key, {
        key,
        name: s.classroom ? s.classroom.name : "Unassigned classroom",
        sub: s.classroom
          ? `${s.classroom._count.students} students · Batch ${s.classroom.batch}`
          : "Subject has no classroom yet",
        rows: [],
      });
    }
    byClass.get(key)!.rows.push(s);
  }
  return Array.from(byClass.values());
}

export default function StaffSubjectsPage() {
  const [subjects, setSubjects] = useState<StaffSubject[]>([]);
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
      const res = await getStaffSubjects({
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

  const groups = groupByClassroom(subjects);

  return (
    <div>
      <PageHeader
        breadcrumb="Faculty / Assigned Subjects"
        title="My Assigned Subjects"
        description="Subjects mapped to you by your advisor, grouped by classroom."
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
            placeholder="Search by subject name or code…"
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
        <TableSkeleton rows={6} cols={5} />
      ) : subjects.length === 0 ? (
        <div className="nd-table-card">
          <EmptyState
            title="No subjects assigned yet"
            description="Subjects mapped to you by your advisor will appear here, grouped by classroom."
          />
        </div>
      ) : (
        <div className="nd-table-card">
          <div className="nd-table-scroll">
            <table className="nd-table" data-testid="staff-subjects-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Subject</th>
                  <th>Classroom</th>
                  <th>Students</th>
                  <th>Decided</th>
                  <th style={{ textAlign: "right" }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <React.Fragment key={g.key}>
                    <tr className="nd-group-head-row">
                      <td colSpan={6}>
                        <div className="nd-group-head">
                          <span className="nd-group-head-title">{g.name}</span>
                          <span className="nd-group-head-sub">{g.sub}</span>
                        </div>
                      </td>
                    </tr>
                    {g.rows.map((s) => (
                      <tr key={s.id}>
                        <td><span className="nd-code">{s.code}</span></td>
                        <td>
                          <div className="nd-cell-primary">{s.name}</div>
                          <div className="nd-cell-secondary">Sem {s.semester} · {s.credits} credits</div>
                        </td>
                        <td className="nd-cell-secondary">
                          {s.classroom ? `${s.classroom.name} · ${s.classroom.batch}` : "—"}
                        </td>
                        <td className="nd-cell-num">{s.classroom?._count.students ?? 0}</td>
                        <td className="nd-cell-num">{s._count.approvals}</td>
                        <td style={{ textAlign: "right" }}>
                          <Link href={`/staff/subjects/${s.id}`} className="nd-btn nd-btn-secondary nd-btn-sm">
                            View
                            <ArrowRight style={{ width: 13, height: 13 }} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} unit="subjects" onChange={setCurrentPage} />
        </div>
      )}
    </div>
  );
}