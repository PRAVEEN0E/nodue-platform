"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getHodStudents, getHodStudentStatus, HodStudent } from "@/lib/hod-api";
import { ApiError } from "@/lib/api";
import { Search, RefreshCw, Activity } from "lucide-react";
import { PageHeader, Badge, Button } from "@/components/ui/controls";
import { TableSkeleton, EmptyState, ErrorState, Pagination } from "@/components/ui/feedback";
import { ClearanceTicks } from "@/components/clearance/ClearanceTicks";
import { ClearanceModal } from "@/components/clearance/ClearanceModal";

export default function HodStudentsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<HodStudent[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingStatusStudent, setViewingStatusStudent] = useState<HodStudent | null>(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getHodStudents({ page: currentPage, limit: 20, search: search.trim() || undefined });
      setStudents(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load students.");
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
        breadcrumb="HOD / Students"
        title="Department Students"
        description="All students in your department. Click the progress icon to view their clearance pipeline."
        actions={
          <Button variant="secondary" onClick={load} aria-label="Refresh">
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
            placeholder="Search by name or register number..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            aria-label="Search students"
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
        <TableSkeleton rows={8} cols={5} />
      ) : students.length === 0 ? (
        <div className="nd-table-card">
          <EmptyState
            title="No students found"
            description="There are no students in your department matching the current filters."
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
                  <th>Classroom</th>
                  <th>Clearance</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="nd-user-cell">
                        <div className="nd-avatar" aria-hidden="true">
                          {s.user.firstName[0]}{s.user.lastName[0]}
                        </div>
                        <span className="nd-cell-primary">{s.user.firstName} {s.user.lastName}</span>
                      </div>
                    </td>
                    <td className="nd-cell-secondary" style={{ fontFamily: "monospace", fontSize: 12.5 }}>{s.registerNumber}</td>
                    <td className="nd-cell-secondary">{s.classroom.name} &middot; Sem {s.classroom.semester}</td>
                    <td>
                      <ClearanceTicks
                        clearance={s.clearance}
                        onClick={() => setViewingStatusStudent(s)}
                      />
                    </td>
                    <td>
                      <Badge tone={s.user.isActive ? "success" : "danger"}>
                        {s.user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewingStatusStudent(s)}
                        aria-label={"View clearance progress for " + s.user.firstName}
                        title="View clearance progress"
                      >
                        <Activity style={{ width: 14, height: 14 }} />
                        Progress
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} unit="students" onChange={setCurrentPage} />
        </div>
      )}

      {viewingStatusStudent && (
        <ClearanceModal
          isOpen={Boolean(viewingStatusStudent)}
          onClose={() => setViewingStatusStudent(null)}
          studentId={viewingStatusStudent.id}
          studentName={`${viewingStatusStudent.user.firstName} ${viewingStatusStudent.user.lastName}`}
          registerNumber={viewingStatusStudent.registerNumber}
          loadStatus={getHodStudentStatus}
          fullPageUrl={`/hod/students/${viewingStatusStudent.id}/status`}
        />
      )}
    </div>
  );
}
