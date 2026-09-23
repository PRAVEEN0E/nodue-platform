"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getStaffStudents, getStaffSubjects, getStaffClasses, StaffStudent, StaffClass } from "@/lib/staff-api";
import { ApiError } from "@/lib/api";
import { Search, RefreshCw, Eye } from "lucide-react";
import { PageHeader, Badge, Button } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlays";
import { TableSkeleton, EmptyState, ErrorState, Pagination } from "@/components/ui/feedback";

interface StudentGroup {
  key: string;
  name: string;
  rows: StaffStudent[];
}

export default function StaffStudentsPage() {
  const [students, setStudents] = useState<StaffStudent[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [classroomFilter, setClassroomFilter] = useState("");
  const [subjects, setSubjects] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [classes, setClasses] = useState<StaffClass[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [detail, setDetail] = useState<StaffStudent | null>(null);

  useEffect(() => {
    getStaffSubjects({ page: 1, limit: 100 })
      .then((res) => setSubjects(res.data.map((s) => ({ id: s.id, code: s.code, name: s.name }))))
      .catch(() => setSubjects([]));
    getStaffClasses()
      .then((res) => setClasses(res.data))
      .catch(() => setClasses([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStaffStudents({
        page: currentPage,
        limit: 20,
        search: search.trim() || undefined,
        subjectId: subjectFilter || undefined,
      });
      setStudents(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load students.");
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, subjectFilter]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const visible =
    classroomFilter === ""
      ? students
      : students.filter((s) => s.classroom.id === classroomFilter);

  const groups: StudentGroup[] = [];
  const byClass = new Map<string, StaffStudent[]>();
  for (const s of visible) {
    if (!byClass.has(s.classroom.id)) byClass.set(s.classroom.id, []);
    byClass.get(s.classroom.id)!.push(s);
  }
  for (const [key, rows] of Array.from(byClass.entries())) {
    groups.push({ key, name: rows[0].classroom.name, rows });
  }

  const setSubjectFilterAndReset = (v: string) => { setSubjectFilter(v); setCurrentPage(1); };
  const setClassroomFilterAndReset = (v: string) => { setClassroomFilter(v); setCurrentPage(1); };

  return (
    <div>
      <PageHeader
        breadcrumb="Faculty / Students"
        title="Students"
        description="Students in the classrooms of your assigned subjects, grouped by classroom."
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
            placeholder="Search by name or register number…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            aria-label="Search students"
          />
        </div>
        <select
          className="nd-select" style={{ width: "auto", minWidth: 180 }}
          value={classroomFilter}
          onChange={(e) => setClassroomFilterAndReset(e.target.value)}
          aria-label="Filter by classroom"
        >
          <option value="">All My Classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          className="nd-select" style={{ width: "auto", minWidth: 180 }}
          value={subjectFilter}
          onChange={(e) => setSubjectFilterAndReset(e.target.value)}
          aria-label="Filter by subject"
        >
          <option value="">All My Subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
          ))}
        </select>
      </div>

      {error && !loading && (
        <div className="nd-card" style={{ marginBottom: 16 }}>
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : visible.length === 0 ? (
        <div className="nd-table-card">
          <EmptyState
            title="No students available"
            description="Students in your assigned subject classrooms will appear here, grouped by classroom."
          />
        </div>
      ) : (
        <div className="nd-table-card">
          <div className="nd-table-scroll">
            <table className="nd-table" data-testid="staff-students-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Register No</th>
                  <th>Classroom</th>
                  <th>Decisions</th>
                  <th style={{ textAlign: "right" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <React.Fragment key={g.key}>
                    <tr className="nd-group-head-row">
                      <td colSpan={5}>
                        <div className="nd-group-head">
                          <span className="nd-group-head-title">{g.name}</span>
                          <span className="nd-group-head-sub">{g.rows.length} students</span>
                        </div>
                      </td>
                    </tr>
                    {g.rows.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div className="nd-user-cell">
                            <div className="nd-avatar" aria-hidden="true">
                              {s.user.firstName[0]}{s.user.lastName[0]}
                            </div>
                            <span className="nd-cell-primary">{s.user.firstName} {s.user.lastName}</span>
                          </div>
                        </td>
                        <td className="nd-cell-secondary" style={{ fontFamily: "monospace", fontSize: 12.5 }}>
                          {s.registerNumber}
                        </td>
                        <td className="nd-cell-secondary">{s.classroom.name}</td>
                        <td>
                          {s.staffDecisions.total === 0 ? (
                            <span className="nd-cell-secondary">—</span>
                          ) : s.staffDecisions.decided >= s.staffDecisions.total ? (
                            <Badge tone="success">{s.staffDecisions.decided}/{s.staffDecisions.total} decided</Badge>
                          ) : (
                            <Badge tone="warning">{s.staffDecisions.decided}/{s.staffDecisions.total} decided</Badge>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <Button variant="ghost" size="sm" onClick={() => setDetail(s)} aria-label={`View ${s.user.firstName}`}>
                            <Eye style={{ width: 14, height: 14 }} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} unit="students" onChange={setCurrentPage} />
        </div>
      )}

      {detail && (
        <Modal
          title={`${detail.user.firstName} ${detail.user.lastName}`}
          description={`${detail.registerNumber} · ${detail.classroom.name}`}
          onClose={() => setDetail(null)}
          footer={<Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>}
        >
          <div>
            <div className="nd-def-row"><span className="nd-def-label">Email</span><span className="nd-def-value" style={{ fontFamily: "monospace", fontSize: 12.5 }}>{detail.user.email}</span></div>
            <div className="nd-def-row">
              <span className="nd-def-label">Account</span>
              <span className="nd-def-value">
                <Badge tone={detail.user.isActive ? "success" : "danger"}>{detail.user.isActive ? "Active" : "Inactive"}</Badge>
              </span>
            </div>
            <div className="nd-def-row"><span className="nd-def-label">My decisions</span><span className="nd-def-value">{detail.staffDecisions.decided} of {detail.staffDecisions.total}</span></div>
          </div>
        </Modal>
      )}
    </div>
  );
}