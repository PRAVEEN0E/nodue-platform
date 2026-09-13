"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Users, BookOpen, Clock, ArrowRight } from "lucide-react";
import { EmptyState } from "@/components/ui/feedback";
import type { StaffClass } from "@/lib/staff-api";

// Metric pluralization: "1 student" vs "2 students", "1 subject" vs "2 subjects",
// "1 pending" vs "2 pending" (pending is invariant).
function metric(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

interface DeptGroup {
  dept: StaffClass["department"];
  items: StaffClass[];
}

// My Classes grid: classrooms derived from the staff member's subject
// assignments, grouped by department. Because staff are college-wide, classes
// may span multiple departments — the grid automatically groups by department
// and shows an "All Departments" filter when 2+ departments are present.
// Data is fetched server-scoped (/staff/classes → assignment.staffId).
export function StaffClassGrid({
  classes,
  emptyText = "No classes assigned",
  emptyDescription = "Your assigned classrooms will appear here once an advisor assigns subjects to you.",
  showDeptFilter = false,
}: {
  classes: StaffClass[];
  emptyText?: string;
  emptyDescription?: string;
  showDeptFilter?: boolean;
}) {
  const groups = useMemo<DeptGroup[]>(() => {
    if (classes.length === 0) return [];
    const byId = new Map<string, DeptGroup>();
    for (const c of classes) {
      const key = c.department.id;
      const existing = byId.get(key);
      if (existing) {
        existing.items.push(c);
      } else {
        byId.set(key, { dept: c.department, items: [c] });
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.dept.code.localeCompare(b.dept.code));
  }, [classes]);

  const departments = useMemo(() => groups.map((g) => g.dept), [groups]);

  const [deptFilter, setDeptFilter] = useState<string>("all");

  const visible = deptFilter === "all" ? groups : groups.filter((g) => g.dept.id === deptFilter);

  if (classes.length === 0) {
    return <EmptyState title={emptyText} description={emptyDescription} />;
  }

  return (
    <div>
      {showDeptFilter && departments.length > 1 && (
        <div className="nd-class-filter">
          <label className="nd-label sr-only" htmlFor="staff-class-dept-filter">
            Filter by department
          </label>
          <select
            id="staff-class-dept-filter"
            className="nd-select"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            data-testid="staff-class-dept-filter"
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {visible.map((g) => (
        <div key={g.dept.id} data-testid="staff-class-dept-group">
          <div className="nd-class-dept">
            <span className="nd-class-dept-code">{g.dept.code}</span>
            <span className="nd-class-dept-name">{g.dept.name}</span>
            <span className="nd-class-dept-line" />
          </div>

          <div className="nd-class-grid">
            {g.items.map((c) => (
              <Link
                key={c.id}
                href={`/staff/classes/${c.id}`}
                className="nd-class-card"
                data-testid={`staff-class-card-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              >
                <div className="nd-class-card-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="nd-class-card-title" style={{ overflowWrap: "anywhere" }}>
                      {c.name}
                    </div>
                    <div className="nd-class-card-sub">
                      {c.department.code} · Semester {c.semester} · Section {c.section} · Batch {c.batch}
                    </div>
                  </div>
                  <ArrowRight size={16} className="nd-class-card-arrow" />
                </div>
                <div className="nd-class-card-stats">
                  <span className="nd-class-stat">
                    <Users size={14} />
                    {metric(c.studentCount, "student", "students")}
                  </span>
                  <span className="nd-class-stat">
                    <BookOpen size={14} />
                    {metric(c.subjectCount, "subject", "subjects")}
                  </span>
                  <span className="nd-class-stat">
                    <Clock size={14} />
                    {metric(c.pendingCount, "pending", "pending")}
                  </span>
                </div>
                <div className="nd-class-card-footer">
                  <span>View Class</span>
                  <ArrowRight size={14} className="nd-class-card-cta-arrow" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {visible.length === 0 && groups.length > 0 && (
        <EmptyState
          title="No classes in this department"
          description="You have classes in other departments. Select a different department or All Departments to see them."
        />
      )}
    </div>
  );
}

// Loading skeleton mirroring the grouped class-card layout (title, identity, metrics).
export function StaffClassGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div data-testid="staff-class-grid-skeleton">
      <div className="nd-class-dept">
        <div className="nd-skel" style={{ width: 54, height: 14 }} />
        <div className="nd-skel" style={{ width: 84, height: 12 }} />
        <span className="nd-class-dept-line" />
      </div>
      <div className="nd-class-grid">
        {Array.from({ length: count }).map((_, i) => (
          <div className="nd-class-card nd-class-card--skeleton" key={i} aria-hidden="true">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="nd-skel nd-skel-title" style={{ width: "62%" }} />
                <div className="nd-skel" style={{ width: "82%", height: 10 }} />
              </div>
              <div className="nd-skel" style={{ width: 16, height: 16, flexShrink: 0 }} />
            </div>
            <div className="nd-class-card-stats">
              <div className="nd-skel" style={{ width: 96, height: 12 }} />
              <div className="nd-skel" style={{ width: 84, height: 12 }} />
              <div className="nd-skel" style={{ width: 90, height: 12 }} />
            </div>
            <div className="nd-skel" style={{ width: 108, height: 13 }} />
          </div>
        ))}
      </div>
    </div>
  );
}