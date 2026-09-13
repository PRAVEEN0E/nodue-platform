"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { getStaffSubjectById, StaffSubjectDetail } from "@/lib/staff-api";
import { ApiError } from "@/lib/api";
import { RefreshCw } from "lucide-react";
import { PageHeader, Badge, Button, Card } from "@/components/ui/controls";
import { PageLoader, ErrorState } from "@/components/ui/feedback";

export default function StaffSubjectDetailPage() {
  const params = useParams<{ id: string }>();
  const [subject, setSubject] = useState<StaffSubjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStaffSubjectById(params.id);
      setSubject(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load subject.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoader label="Loading subject…" />;

  if (error || !subject) {
    return (
      <div>
        <PageHeader breadcrumb="Faculty / Subjects" title="Subject" description="" />
        <Card>
          <ErrorState message={error ?? "Subject not found"} onRetry={load} />
        </Card>
      </div>
    );
  }

  const decided = subject.students.filter((s) => s.approvals.length > 0).length;

  return (
    <div>
      <PageHeader
        breadcrumb="Faculty / Subjects / Detail"
        title={`${subject.code} · ${subject.name}`}
        description={
          subject.classroom
            ? `${subject.classroom.name} · Batch ${subject.classroom.batch} · Sem ${subject.classroom.semester}-${subject.classroom.section}`
            : "Classroom unassigned"
        }
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
          <span className="nd-stat-value">{subject.students.length}</span>
        </div>
        <div className="nd-stat">
          <span className="nd-stat-label">Decided</span>
          <span className="nd-stat-value">{decided}</span>
        </div>
        <div className="nd-stat">
          <span className="nd-stat-label">Pending</span>
          <span className="nd-stat-value">{subject.students.length - decided}</span>
        </div>
      </div>

      <Card title="Students" description="Approval status per student for this subject.">
        {subject.students.length === 0 ? (
          <p className="nd-cell-secondary">No students enrolled in this classroom.</p>
        ) : (
          <div className="nd-table-scroll">
            <table className="nd-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Register No</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {subject.students.map((s) => {
                  const decision = s.approvals[0];
                  return (
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
                      <td>
                        {!decision ? (
                          <Badge tone="warning">Pending</Badge>
                        ) : (
                          <Badge tone={decision.status === "APPROVED" ? "success" : "danger"}>
                            {decision.status === "APPROVED" ? "Approved" : "Rejected"}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="nd-section">
        <Card title="Assigned staff" description="Faculty mapped to this subject.">
          {subject.subjectStaff.length === 0 ? (
            <p className="nd-cell-secondary">No staff mappings.</p>
          ) : (
            subject.subjectStaff.map(({ staff }) => (
              <div className="nd-def-row" key={staff.id}>
                <span className="nd-def-label">
                  {staff.user.firstName} {staff.user.lastName} · {staff.employeeCode}
                </span>
                <span className="nd-def-value nd-cell-secondary">{staff.user.email}</span>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
