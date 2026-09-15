"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getAdvisorDashboard, getAdvisorApprovals, AdvisorDashboardData } from "@/lib/advisor-api";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/context/auth-context";
import {
  GraduationCap,
  Users,
  BookOpen,
  Briefcase,
  ArrowRight,
  RefreshCw,
  Wallet,
  FileSpreadsheet,
  Download,
} from "lucide-react";
import { PageHeader, StatCard, Card, Button, Badge } from "@/components/ui/controls";
import { PageLoader, ErrorState, ActivityList } from "@/components/ui/feedback";
import { humanizeActivity } from "@/lib/activity";
import { downloadAdvisorDefaultersReport, downloadAdvisorClearanceReport } from "@/lib/bulk-api";

export default function AdvisorDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AdvisorDashboardData | null>(null);
  const [pendingReviews, setPendingReviews] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingDefaulters, setExportingDefaulters] = useState(false);
  const [exportingClearance, setExportingClearance] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [res, queue] = await Promise.all([
        getAdvisorDashboard(),
        getAdvisorApprovals({ page: 1, limit: 1, status: "pending" }).catch(() => null),
      ]);
      setData(res);
      setPendingReviews(queue?.meta.total ?? 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load advisor dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoader label="Loading classroom overview…" />;

  if (error || !data) {
    return (
      <div>
        <PageHeader breadcrumb="Advisor / Dashboard" title="Dashboard" description="Classroom overview" />
        <Card>
          <ErrorState message={error ?? "Failed to load dashboard"} onRetry={load} />
        </Card>
      </div>
    );
  }

  const { classroom, counts, fees, recentActivity } = data;

  const activities = recentActivity.map((log) => humanizeActivity(log));

  return (
    <div>
      <PageHeader
        breadcrumb="Advisor / Dashboard"
        title={`Welcome, ${user?.firstName ?? ""} ${user?.lastName ?? ""}`}
        description={`${classroom.name} · Batch ${classroom.batch} · Semester ${classroom.semester} · Section ${classroom.section}`}
        actions={
          <Button variant="secondary" onClick={load}>
            <RefreshCw style={{ width: 14, height: 14 }} />
            Refresh
          </Button>
        }
      />

      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span className="nd-code">{classroom.department.code}</span>
        <Badge tone="info">{classroom.department.name}</Badge>
        <Badge tone={pendingReviews > 0 ? "warning" : "success"}>
          {pendingReviews > 0 ? `${pendingReviews} awaiting advisor review` : "Reviews up to date"}
        </Badge>
      </div>

      <div className="nd-stat-grid">
        <StatCard
          label="Students"
          value={counts.students}
          sub="Enrolled in your classroom"
          icon={<GraduationCap style={{ width: 17, height: 17 }} />}
        />
        <StatCard
          label="Subjects"
          value={counts.subjects}
          sub={`${counts.unmappedSubjects} without assigned staff`}
          icon={<BookOpen style={{ width: 17, height: 17 }} />}
        />
        <StatCard
          label="Staff"
          value={counts.staff}
          sub="In your classroom"
          icon={<Briefcase style={{ width: 17, height: 17 }} />}
        />
        <StatCard
          label="Fees Pending"
          value={fees.pending}
          sub={`${fees.verified} verified`}
          icon={<Wallet style={{ width: 17, height: 17 }} />}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }} className="nd-two-col">
        <Card title="Fee verification" description="Classroom fee verification summary.">
          <div style={{ marginTop: 12 }}>
            <div className="nd-def-row">
              <span className="nd-def-label">Verified</span>
              <span className="nd-def-value">
                <Badge tone="success">{fees.verified}</Badge>
              </span>
            </div>
            <div className="nd-def-row">
              <span className="nd-def-label">Pending</span>
              <span className="nd-def-value">
                <Badge tone="warning">{fees.pending}</Badge>
              </span>
            </div>
            <div style={{ marginTop: 12 }}>
              <Link href="/advisor/fees" style={{ fontSize: 13, fontWeight: 600, color: "#1d4ed8", textDecoration: "none" }}>
                Verify fees
              </Link>
            </div>
          </div>
        </Card>

        <Card
          title="Recent activity"
          description="Latest events in your department."
          actions={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, color: "#1d4ed8" }}>
              <Users style={{ width: 14, height: 14 }} /> Classroom scope
            </span>
          }
        >
          <ActivityList items={activities} emptyText="No recent activity." />
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Exportable Reports" description="Classroom clearance and defaulters reports for exam hall ticket processing.">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }} className="nd-two-col">
            <button
              onClick={async () => {
                setExportingDefaulters(true);
                try {
                  await downloadAdvisorDefaultersReport();
                } catch {
                  alert("Failed to export defaulters report");
                } finally {
                  setExportingDefaulters(false);
                }
              }}
              disabled={exportingDefaulters}
              className="nd-btn nd-btn-outline"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                background: "#fff",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <FileSpreadsheet style={{ width: 20, height: 20, color: "var(--nd-error)" }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--nd-navy)" }}>
                    {exportingDefaulters ? "Exporting…" : "Classroom Defaulters List (CSV)"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--nd-muted)" }}>
                    Students with pending fees or incomplete approvals
                  </div>
                </div>
              </div>
              <Download style={{ width: 16, height: 16, color: "var(--nd-muted)" }} />
            </button>

            <button
              onClick={async () => {
                setExportingClearance(true);
                try {
                  await downloadAdvisorClearanceReport();
                } catch {
                  alert("Failed to export clearance summary");
                } finally {
                  setExportingClearance(false);
                }
              }}
              disabled={exportingClearance}
              className="nd-btn nd-btn-outline"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                background: "#fff",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <FileSpreadsheet style={{ width: 20, height: 20, color: "var(--nd-blue)" }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--nd-navy)" }}>
                    {exportingClearance ? "Exporting…" : "Classroom Clearance Summary (CSV)"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--nd-muted)" }}>
                    Stage-by-stage clearance metrics across all students
                  </div>
                </div>
              </div>
              <Download style={{ width: 16, height: 16, color: "var(--nd-muted)" }} />
            </button>
          </div>
        </Card>
      </div>

      <div className="nd-section">
        <h2 className="nd-section-title">Manage</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }} className="nd-manage-grid">
          {[
            { href: "/advisor/students", label: "Students", desc: `${counts.students} enrolled` },
            { href: "/advisor/staff", label: "Staff", desc: `${counts.staff} in classroom` },
            { href: "/advisor/subjects", label: "Subjects", desc: `${counts.subjects} total` },
            { href: "/advisor/fees", label: "Fees", desc: "Verification status" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="nd-card"
              style={{ padding: 16, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
            >
              <span>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{l.label}</span>
                <span style={{ display: "block", fontSize: 12.5, color: "#64748b" }}>{l.desc}</span>
              </span>
              <ArrowRight style={{ width: 16, height: 16, color: "#94a3b8" }} />
            </Link>
          ))}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          .nd-two-col {
            grid-template-columns: 1fr !important;
          }
          .nd-manage-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 560px) {
          .nd-manage-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
