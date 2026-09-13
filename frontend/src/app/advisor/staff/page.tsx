"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  getAdvisorStaff,
  getAdvisorStaffAvailable,
  AdvisorStaff,
  AdvisorAvailableStaff,
} from "@/lib/advisor-api";
import { ApiError } from "@/lib/api";
import { Search, RefreshCw, ArrowRight } from "lucide-react";
import { PageHeader, Badge, Button, Card, LinkButton } from "@/components/ui/controls";
import { TableSkeleton, EmptyState, ErrorState } from "@/components/ui/feedback";

// Staff Assignment — discovery only. Staff accounts are created by the
// administrator. Advisors view eligible existing staff here and perform the
// actual mapping on the Subjects page (no staff creation/editing on this page).

export default function AdvisorStaffPage() {
  const [available, setAvailable] = useState<AdvisorAvailableStaff[]>([]);
  const [assigned, setAssigned] = useState<AdvisorStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const term = search.trim() || undefined;
      const [availRes, assignedRes] = await Promise.all([
        getAdvisorStaffAvailable({ page: 1, limit: 100, search: term }),
        getAdvisorStaff({ page: 1, limit: 100, search: term }),
      ]);
      setAvailable(availRes.data);
      setAssigned(assignedRes.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load staff.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  return (
    <div>
      <PageHeader
        breadcrumb="Advisor / Staff"
        title="Staff Assignment"
        description="Assign available staff to subjects in your classroom. Staff accounts are created by the administrator."
      />

      <div className="nd-filter-bar" role="search">
        <div className="nd-search-wrap">
          <Search className="nd-search-icon" style={{ width: 16, height: 16 }} />
          <input
            className="nd-input nd-search-input"
            placeholder="Search staff by name, email or employee code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search staff"
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
        <TableSkeleton rows={8} cols={4} />
      ) : (
        <>
          <Card
            title="Available Staff"
            description="Existing staff college-wide who are eligible for assignment. Map them to specific subjects on the Subjects page."
            actions={<LinkButton href="/advisor/subjects" variant="secondary" size="sm">Open Subjects <ArrowRight style={{ width: 14, height: 14 }} /></LinkButton>}
          >
            {available.length === 0 ? (
              <EmptyState
                title="No staff available"
                description="Staff members created by the administrator will appear here when they are available for assignment."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {available.map((s) => (
                  <div key={s.id} className="nd-def-row">
                    <div className="nd-user-cell">
                      <div className="nd-avatar" aria-hidden="true">
                        {s.user.firstName[0]}{s.user.lastName[0]}
                      </div>
                      <div>
                        <div className="nd-cell-primary">{s.user.firstName} {s.user.lastName}</div>
                        <div className="nd-cell-secondary">
                          {s.designation} · <span style={{ fontFamily: "monospace", fontSize: 12.5 }}>{s.employeeCode}</span>
                        </div>
                      </div>
                    </div>
                    <span className="nd-def-value" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      {s.department && <Badge tone="info">{s.department.code}</Badge>}
                      <Badge tone="success">Active</Badge>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Assigned Staff"
            description="Staff adopted into your classroom. Subject-level assignment is managed on the Subjects page."
          >
            {assigned.length === 0 ? (
              <EmptyState
                title="No assigned staff"
                description="Map staff to subjects on the Subjects page to assign them to your classroom."
              />
            ) : (
              <div className="nd-table-scroll">
                <table className="nd-table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Employee ID</th>
                      <th>Status</th>
                      <th>Classroom Subjects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assigned.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div className="nd-user-cell">
                            <div className="nd-avatar" aria-hidden="true">
                              {s.user.firstName[0]}{s.user.lastName[0]}
                            </div>
                            <div>
                              <div className="nd-cell-primary">{s.user.firstName} {s.user.lastName}</div>
                              <div className="nd-cell-secondary">{s.designation}</div>
                            </div>
                          </div>
                        </td>
                        <td className="nd-cell-secondary" style={{ fontFamily: "monospace", fontSize: 12.5 }}>{s.employeeCode}</td>
                        <td>
                          <Badge tone={s.user.isActive ? "success" : "danger"}>
                            {s.user.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td>
                          {s.subjectStaff.length === 0 ? (
                            <span className="nd-cell-secondary">—</span>
                          ) : (
                            <span className="nd-cell-primary">
                              {s.subjectStaff.length} subject{s.subjectStaff.length !== 1 ? "s" : ""}:{" "}
                              <span className="nd-cell-secondary">
                                {s.subjectStaff.map((m) => m.subject.code).join(", ")}
                              </span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}