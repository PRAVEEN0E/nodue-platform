"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getStaffClassById, StaffClassDetail } from "@/lib/staff-api";
import { ApiError } from "@/lib/api";
import { RefreshCw, ArrowRight } from "lucide-react";
import { PageHeader, Badge, Button, Card } from "@/components/ui/controls";
import { PageLoader, ErrorState, EmptyState } from "@/components/ui/feedback";

export default function StaffClassDetailPage() {
  const params = useParams<{ id: string }>();
  const [classroom, setClassroom] = useState<StaffClassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStaffClassById(params.id);
      setClassroom(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load classroom.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoader label="Loading classroom…" />;

  if (error || !classroom) {
    return (
      <div>
        <PageHeader breadcrumb="Faculty / My Classes" title="Classroom" description="" />
        <Card>
          <ErrorState message={error ?? "Classroom not found"} onRetry={load} />
        </Card>
      </div>
    );
  }

  const pendingTotal = classroom.subjects.reduce((sum, s) => sum + s.pendingCount, 0);

  return (
    <div>
      <PageHeader
        breadcrumb="Faculty / My Classes"
        title={classroom.name}
        description={`${classroom.department.code} · Semester ${classroom.semester} · Section ${classroom.section} · Batch ${classroom.batch}`}
        actions={
          <Button variant="secondary" onClick={load}>
            <RefreshCw style={{ width: 14, height: 14 }} />
            Refresh
          </Button>
        }
      />

      <div className="nd-stat-grid nd-stat-grid--3">
        <div className="nd-stat">
          <span className="nd-stat-label">Students</span>
          <span className="nd-stat-value">{classroom.studentCount}</span>
        </div>
        <div className="nd-stat">
          <span className="nd-stat-label">Assigned Subjects</span>
          <span className="nd-stat-value">{classroom.subjects.length}</span>
        </div>
        <div className="nd-stat">
          <span className="nd-stat-label">Pending Approvals</span>
          <span className="nd-stat-value">{pendingTotal}</span>
        </div>
      </div>

      <div className="nd-section">
        <Card
          title="Assigned Subjects"
          description="Subjects mapped to you in this classroom. Open a subject to review its students."
        >
          {classroom.subjects.length === 0 ? (
            <EmptyState
              title="No assigned subjects in this classroom"
              description="Your advisor maps subjects to you per classroom."
            />
          ) : (
            <div className="nd-table-scroll">
              <table className="nd-table" data-testid="staff-class-subjects-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Subject</th>
                    <th>Students</th>
                    <th>Pending</th>
                    <th style={{ textAlign: "right" }}>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {classroom.subjects.map((s) => (
                    <tr key={s.id}>
                      <td><span className="nd-code">{s.code}</span></td>
                      <td>
                        <div className="nd-cell-primary">{s.name}</div>
                        <div className="nd-cell-secondary">Sem {s.semester} · {s.credits} credits</div>
                      </td>
                      <td className="nd-cell-num">{s.studentCount}</td>
                      <td>
                        {s.pendingCount > 0 ? (
                          <Badge tone="warning">{s.pendingCount} pending</Badge>
                        ) : (
                          <Badge tone="success">All decided</Badge>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link href={`/staff/subjects/${s.id}`} className="nd-btn nd-btn-secondary nd-btn-sm">
                          Open
                          <ArrowRight style={{ width: 13, height: 13 }} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}