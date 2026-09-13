"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getDashboardStats, DashboardStats } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { Building2, UserCheck, Users, PieChart, RefreshCw } from "lucide-react";
import { PageHeader, StatCard, Card, Button } from "@/components/ui/controls";
import { PageLoader, ErrorState, ActivityList } from "@/components/ui/feedback";
import { humanizeActivity } from "@/lib/activity";

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getDashboardStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoader label="Loading dashboard…" />;
  if (error || !stats) {
    return (
      <div>
        <PageHeader breadcrumb="Admin / Dashboard" title="Dashboard" description="System-wide overview" />
        <Card>
          <ErrorState message={error ?? "Failed to load dashboard"} onRetry={load} />
        </Card>
      </div>
    );
  }

  const coverage =
    stats.totalDepartments > 0
      ? Math.round((stats.departmentsWithHod / stats.totalDepartments) * 100)
      : 0;

  const activities = stats.recentActivities.map((log) => humanizeActivity(log));

  return (
    <div>
      <PageHeader
        breadcrumb="Admin / Dashboard"
        title="Dashboard"
        description="System-wide overview of departments, people, and HOD coverage."
        actions={
          <Button variant="secondary" onClick={load}>
            <RefreshCw style={{ width: 14, height: 14 }} />
            Refresh
          </Button>
        }
      />

      <div className="nd-stat-grid">
        <StatCard
          label="Total Departments"
          value={stats.totalDepartments}
          sub={`${stats.departmentsWithHod} with HOD assigned`}
          icon={<Building2 style={{ width: 17, height: 17 }} />}
        />
        <StatCard
          label="HOD Coverage"
          value={`${coverage}%`}
          sub={
            stats.departmentsWithoutHod > 0
              ? `${stats.departmentsWithoutHod} department${stats.departmentsWithoutHod !== 1 ? "s" : ""} need an HOD`
              : "Every department has an HOD"
          }
          icon={<PieChart style={{ width: 17, height: 17 }} />}
        />
        <StatCard
          label="Total Users"
          value={stats.totalUsers.toLocaleString()}
          sub={`${stats.activeUsers.toLocaleString()} active`}
          icon={<Users style={{ width: 17, height: 17 }} />}
        />
        <StatCard
          label="Active Users"
          value={stats.activeUsers.toLocaleString()}
          sub={`${stats.inactiveUsers.toLocaleString()} inactive`}
          icon={<UserCheck style={{ width: 17, height: 17 }} />}
        />
      </div>

      <Card title="Recent activity" description="Latest administrative and sign-in events across the system.">
        <ActivityList items={activities} emptyText="No recent activity." />
      </Card>
    </div>
  );
}
