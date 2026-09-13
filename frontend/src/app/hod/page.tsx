"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getHodDashboard, getHodApprovals, HodDashboardData } from "@/lib/hod-api";
import { ApiError } from "@/lib/api";
import {
  GraduationCap,
  Users,
  Building2,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { PageHeader, StatCard, Card, Button, Badge } from "@/components/ui/controls";
import { PageLoader, ErrorState, ActivityList } from "@/components/ui/feedback";
import { humanizeActivity } from "@/lib/activity";

const OPERATIONS = [
  { href: "/hod/classrooms", label: "Manage Classrooms", desc: "Batches, semesters and sections", icon: GraduationCap },
  { href: "/hod/advisors", label: "Advisors", desc: "Create and map advisors", icon: Users },
  { href: "/hod/department", label: "Department Profile", desc: "Institutional information", icon: Building2 },
];

export default function HodDashboardPage() {
  const [data, setData] = useState<HodDashboardData | null>(null);
  const [pendingReviews, setPendingReviews] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setError(null);
    try {
      const [res, queue] = await Promise.all([
        getHodDashboard(),
        getHodApprovals({ page: 1, limit: 1, status: "pending" }).catch(() => null),
      ]);
      setData(res);
      setPendingReviews(queue?.meta.total ?? 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load department dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) return <PageLoader label="Loading department overview…" />;

  if (error || !data) {
    return (
      <div>
        <PageHeader breadcrumb="HOD / Dashboard" title="Dashboard" description="Department overview" />
        <Card>
          <ErrorState message={error ?? "Failed to load dashboard"} onRetry={fetchDashboard} />
        </Card>
      </div>
    );
  }

  const { department, recentActivity } = data;
  const coveragePercent =
    department.counts.classrooms > 0
      ? Math.round((department.counts.assignedClassrooms / department.counts.classrooms) * 100)
      : 0;

  const activities = recentActivity.map((log) => humanizeActivity(log));

  return (
    <div>
      <PageHeader
        breadcrumb="HOD / Dashboard"
        title={department.name}
        description={`${department.code} · Department-scoped overview of classrooms, advisors and students.`}
        actions={
          <>
            <Button variant="secondary" onClick={fetchDashboard}>
              <RefreshCw style={{ width: 14, height: 14 }} />
              Refresh
            </Button>
            <Link href="/hod/classrooms" className="nd-btn nd-btn-primary">
              Manage Classrooms
            </Link>
          </>
        }
      />

      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Badge tone="success">HOD authority active</Badge>
        <Badge tone={pendingReviews > 0 ? "warning" : "success"}>
          {pendingReviews > 0 ? `${pendingReviews} awaiting HOD review` : "Reviews up to date"}
        </Badge>
      </div>

      <div className="nd-stat-grid">
        <StatCard
          label="Classrooms"
          value={department.counts.classrooms}
          sub={`${department.counts.assignedClassrooms} assigned · ${department.counts.unassignedClassrooms} unassigned`}
          icon={<GraduationCap style={{ width: 17, height: 17 }} />}
        />
        <StatCard
          label="Advisors"
          value={department.counts.advisors}
          sub={`Active advisors in ${department.code}`}
          icon={<Users style={{ width: 17, height: 17 }} />}
        />
        <StatCard
          label="Advisor Coverage"
          value={`${coveragePercent}%`}
          sub={`${department.counts.assignedClassrooms} of ${department.counts.classrooms} classes mapped`}
          icon={<CheckCircle2 style={{ width: 17, height: 17 }} />}
        />
        <StatCard
          label="Students"
          value={department.counts.students}
          sub={`Enrolled in ${department.code}`}
          icon={<Building2 style={{ width: 17, height: 17 }} />}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }} className="nd-two-col">
        <Card title="Operations" description="Department management shortcuts.">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {OPERATIONS.map((op) => {
              const Icon = op.icon;
              return (
                <Link
                  key={op.href}
                  href={op.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "12px 14px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 10,
                    textDecoration: "none",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="nd-stat-icon" style={{ width: 32, height: 32 }}>
                      <Icon style={{ width: 16, height: 16 }} />
                    </span>
                    <span>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "#0f172a" }}>
                        {op.label}
                      </span>
                      <span style={{ display: "block", fontSize: 12.5, color: "#64748b" }}>{op.desc}</span>
                    </span>
                  </span>
                  <ArrowRight style={{ width: 16, height: 16, color: "#94a3b8" }} />
                </Link>
              );
            })}
          </div>
        </Card>

        <Card
          title="Recent department activity"
          description="Latest events within your department scope."
          actions={
            <Link href="/hod/audit-logs" style={{ fontSize: 13, fontWeight: 600, color: "#1d4ed8", textDecoration: "none" }}>
              View all
            </Link>
          }
        >
          <ActivityList items={activities} emptyText="No recent activity recorded for this department." />
        </Card>
      </div>

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
