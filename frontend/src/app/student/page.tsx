"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getStudentDashboard, getStudentStatus, StudentDashboardData } from "@/lib/student-api";
import { ApiError } from "@/lib/api";
import { BookOpen, CheckCircle2, Clock, RefreshCw, ArrowRight } from "lucide-react";
import { PageHeader, StatCard, Card, Button, Badge } from "@/components/ui/controls";
import { PageLoader, ErrorState, EmptyState } from "@/components/ui/feedback";

export default function StudentDashboardPage() {
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [res, status] = await Promise.all([getStudentDashboard(), getStudentStatus()]);
      setData(res);
      setVerified(status.finalVerification.verified);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoader label="Loading your dashboard…" />;

  if (error || !data || !data.student) {
    return (
      <div data-testid="student-dashboard">
        <PageHeader breadcrumb="Student / Dashboard" title="Dashboard" description="Your overview" />
        <Card>
          <ErrorState message={error ?? "Student record not found"} onRetry={load} />
        </Card>
      </div>
    );
  }

  const { student, subjects } = data;

  return (
    <div data-testid="student-dashboard">
      <PageHeader
        breadcrumb="Student / Dashboard"
        title={`Welcome, ${student.user.firstName} ${student.user.lastName}`}
        description={`${student.registerNumber} · ${student.classroom.name} · Batch ${student.classroom.batch}`}
        actions={
          <Button variant="secondary" onClick={load}>
            <RefreshCw style={{ width: 14, height: 14 }} />
            Refresh
          </Button>
        }
      />

      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span className="nd-code">{student.classroom.department.code}</span>
        <Badge tone="info">{student.classroom.department.name}</Badge>
        <Badge tone={student.user.isActive ? "success" : "danger"}>
          {student.user.isActive ? "Enrolled" : "Inactive"}
        </Badge>
        {verified && (
          <Badge tone="success" testId="final-verification-status">Final Verified</Badge>
        )}
      </div>

      <div className="nd-stat-grid">
        <StatCard
          label="Subjects"
          value={subjects.total}
          sub={subjects.total === 0 ? "No subjects assigned yet" : `${subjects.approved} approved · ${subjects.pending} pending`}
          icon={<BookOpen style={{ width: 17, height: 17 }} />}
        />
        <StatCard
          label="Approved"
          value={subjects.approved}
          sub={`${subjects.rejected} rejected`}
          icon={<CheckCircle2 style={{ width: 17, height: 17 }} />}
        />
        <StatCard
          label="Pending"
          value={subjects.pending}
          sub="Awaiting staff review"
          icon={<Clock style={{ width: 17, height: 17 }} />}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="nd-two-col">
        <Card
          title="Verification status"
          description="Current stage of your clearance workflow."
          actions={
            <Link href="/student/status" style={{ fontSize: 13, fontWeight: 600, color: "#1d4ed8", textDecoration: "none" }}>
              Details
            </Link>
          }
        >
          <div style={{ marginTop: 12 }}>
            <div className="nd-def-row">
              <span className="nd-def-label">Staff review</span>
              <span className="nd-def-value">{subjects.approved + subjects.rejected} of {subjects.total} decided</span>
            </div>
            <div className="nd-def-row">
              <span className="nd-def-label">Overall</span>
              <span className="nd-def-value">
                <Badge tone={subjects.total > 0 && subjects.pending === 0 ? "success" : "warning"}>
                  {subjects.total === 0 ? "Not started" : subjects.pending === 0 ? "Staff review complete" : "Verification pending"}
                </Badge>
              </span>
            </div>
          </div>
        </Card>

        <Card
          title="Quick links"
          description="Your records."
          actions={undefined}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {[
              { href: "/student/subjects", label: "My subjects", desc: `${subjects.total} in classroom` },
              { href: "/student/profile", label: "My profile", desc: student.registerNumber },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: 10, textDecoration: "none",
                }}
              >
                <span>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "#0f172a" }}>{l.label}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: "#64748b" }}>{l.desc}</span>
                </span>
                <ArrowRight style={{ width: 16, height: 16, color: "#94a3b8" }} />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {subjects.total === 0 && (
        <div style={{ marginTop: 16 }}>
          <EmptyState
            title="Getting started"
            description="Your subjects will appear here once your classroom is set up."
          />
        </div>
      )}

      <style jsx>{`
        @media (max-width: 900px) {
          .nd-two-col {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
