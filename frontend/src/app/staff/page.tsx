"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getStaffDashboard, getStaffClasses, StaffDashboardData, StaffClass } from "@/lib/staff-api";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/context/auth-context";
import { BookOpen, GraduationCap, Clock, CheckCircle2, RefreshCw, ArrowRight } from "lucide-react";
import { PageHeader, StatCard, Card, Button, Badge } from "@/components/ui/controls";
import { PageLoader, ErrorState, ActivityList } from "@/components/ui/feedback";
import { StaffClassGrid } from "@/components/staff/class-grid";

export default function StaffDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<StaffDashboardData | null>(null);
  const [classes, setClasses] = useState<StaffClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [dash, cls] = await Promise.all([getStaffDashboard(), getStaffClasses()]);
      setData(dash);
      setClasses(cls.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load staff dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoader label="Loading your workspace…" />;

  if (error || !data) {
    return (
      <div>
        <PageHeader breadcrumb="Faculty / Dashboard" title="Dashboard" description="Your classes and subject approvals" />
        <Card>
          <ErrorState message={error ?? "Failed to load dashboard"} onRetry={load} />
        </Card>
      </div>
    );
  }

  const { counts, recentDecisions } = data;

  const activities = recentDecisions.map((d) => ({
    id: d.id,
    badge: d.status === "APPROVED" ? "Approved" : "Rejected",
    tone: d.status === "APPROVED" ? "success" as const : "danger" as const,
    title: `${d.student.user.firstName} ${d.student.user.lastName} · ${d.subject?.code ?? "—"}`,
    sub: d.student.registerNumber,
    time: new Date(d.updatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
  }));

  return (
    <div>
      <PageHeader
        breadcrumb="Faculty / Dashboard"
        title={`Welcome, ${user?.firstName ?? ""} ${user?.lastName ?? ""}`}
        description="Your assigned classrooms, subjects and subject-level approvals."
        actions={
          <Button variant="secondary" onClick={load}>
            <RefreshCw style={{ width: 14, height: 14 }} />
            Refresh
          </Button>
        }
      />

      <div className="nd-stat-grid">
        <StatCard
          label="Assigned Subjects"
          value={counts.subjects}
          sub={counts.subjects === 0 ? "No subjects assigned yet" : "Across your classrooms"}
          icon={<BookOpen style={{ width: 17, height: 17 }} />}
        />
        <StatCard
          label="Assigned Students"
          value={counts.students}
          sub={counts.students === 0 ? "No students available" : "In your subject classrooms"}
          icon={<GraduationCap style={{ width: 17, height: 17 }} />}
        />
        <StatCard
          label="Pending Approvals"
          value={counts.pending}
          sub={counts.pending === 0 ? "Nothing awaiting review" : "Awaiting your decision"}
          icon={<Clock style={{ width: 17, height: 17 }} />}
        />
        <StatCard
          label="Approved"
          value={counts.approved}
          sub={`${counts.rejected} rejected`}
          icon={<CheckCircle2 style={{ width: 17, height: 17 }} />}
        />
      </div>

      <div className="nd-section">
        <Card
          title="My Classes"
          description={classes.length === 0 ? "Classrooms appear once subjects are assigned to you." : "Your assigned classrooms — open one to review and approve its subjects."}
          actions={
            classes.length > 0 ? (
              <Link href="/staff/classes" style={{ fontSize: 13, fontWeight: 600, color: "#1d4ed8", textDecoration: "none" }}>
                View all classes
              </Link>
            ) : undefined
          }
        >
          <StaffClassGrid classes={classes} />
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }} className="nd-two-col nd-section">
        <Card
          title="Recently decided"
          description="Your latest subject-level decisions."
          actions={
            <Link href="/staff/approvals" style={{ fontSize: 13, fontWeight: 600, color: "#1d4ed8", textDecoration: "none" }}>
              Open approvals
            </Link>
          }
        >
          <ActivityList items={activities} emptyText="No decisions recorded yet." />
        </Card>

        <Card title="Quick actions" description="Common tasks.">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {[
              { href: "/staff/classes", label: "Browse my classes", desc: `${classes.length} assigned` },
              { href: "/staff/approvals", label: "Review pending", desc: `${counts.pending} awaiting` },
              { href: "/staff/subjects", label: "My subjects", desc: `${counts.subjects} assigned` },
              { href: "/staff/students", label: "Students", desc: `${counts.students} in scope` },
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

      {counts.subjects === 0 && (
        <div className="nd-section">
          <Card>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Badge tone="warning">No assignments</Badge>
              <p className="nd-cell-secondary">
                Your advisor has not mapped you to any subject yet. Subjects and classrooms you are assigned to will appear here.
              </p>
            </div>
          </Card>
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