"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getStaffClasses, StaffClass } from "@/lib/staff-api";
import { ApiError } from "@/lib/api";
import { RefreshCw } from "lucide-react";
import { PageHeader, Button } from "@/components/ui/controls";
import { ErrorState } from "@/components/ui/feedback";
import { StaffClassGrid, StaffClassGridSkeleton } from "@/components/staff/class-grid";

export default function StaffClassesPage() {
  const [classes, setClasses] = useState<StaffClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStaffClasses();
      setClasses(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load your classrooms.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        breadcrumb="Faculty / My Classes"
        title="My Classes"
        description="Your assigned classrooms across the college, grouped by department. Subjects are mapped to you by advisors."
        actions={
          <Button variant="secondary" onClick={load}>
            <RefreshCw style={{ width: 14, height: 14 }} />
            Refresh
          </Button>
        }
      />

      {error && !loading && (
        <div className="nd-card" style={{ marginBottom: 16 }}>
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {loading ? (
        <StaffClassGridSkeleton />
      ) : (
        <StaffClassGrid classes={classes} showDeptFilter />
      )}
    </div>
  );
}