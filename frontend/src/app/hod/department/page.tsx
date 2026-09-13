"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getHodDepartment, updateHodDepartment, DepartmentDetails } from "@/lib/hod-api";
import { ApiError } from "@/lib/api";
import {
  Building2,
  GraduationCap,
  Users,
  Shield,
  RefreshCw,
  Check,
  Lock,
} from "lucide-react";
import { PageHeader, StatCard, Card, Button, Badge, Input } from "@/components/ui/controls";
import { PageLoader, ErrorState } from "@/components/ui/feedback";

export default function HodDepartmentPage() {
  const [department, setDepartment] = useState<DepartmentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchDepartment = useCallback(async () => {
    setError(null);
    try {
      const res = await getHodDepartment();
      setDepartment(res);
      setNameInput(res.name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load department profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDepartment();
  }, [fetchDepartment]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || nameInput.trim() === department?.name) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const updated = await updateHodDepartment(nameInput.trim());
      setDepartment((prev) => (prev ? { ...prev, name: updated.name } : null));
      setIsEditing(false);
      setSuccessMessage("Department name updated successfully.");
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update department name.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader label="Loading department profile…" />;

  if (error && !department) {
    return (
      <div>
        <PageHeader breadcrumb="HOD / Department" title="Department" description="Department profile" />
        <Card>
          <ErrorState message={error} onRetry={fetchDepartment} />
        </Card>
      </div>
    );
  }

  if (!department) return null;

  return (
    <div>
      <PageHeader
        breadcrumb="HOD / Department"
        title="Department Profile"
        description={`Institutional information and resources for ${department.code}.`}
        actions={
          <Button variant="secondary" onClick={fetchDepartment}>
            <RefreshCw style={{ width: 14, height: 14 }} />
            Refresh
          </Button>
        }
      />

      {successMessage && (
        <div className="nd-alert nd-alert-success" role="status">
          <Check style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span>{successMessage}</span>
        </div>
      )}
      {error && department && (
        <div className="nd-alert nd-alert-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      <Card
        title="Department identity"
        description="The department code is assigned by the institution and cannot be changed."
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span className="nd-stat-icon" style={{ width: 42, height: 42 }}>
            <Building2 style={{ width: 20, height: 20 }} />
          </span>
          <div>
            <div className="nd-cell-secondary">Department Code</div>
            <span className="nd-code" style={{ fontSize: 15 }}>{department.code}</span>
          </div>
          <span style={{ marginLeft: "auto" }}>
            <Badge tone="neutral">
              <Lock style={{ width: 12, height: 12 }} /> Code locked
            </Badge>
          </span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <span className="nd-label">Official department name</span>
          {isEditing ? (
            <form onSubmit={handleSave} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <Input
                  label="Department name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setNameInput(department.name);
                  setIsEditing(false);
                }}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 14px",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                background: "#f8fafc",
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>{department.name}</span>
              <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
                Edit name
              </Button>
            </div>
          )}
        </div>

        <div>
          <span className="nd-label">Assigned Head of Department</span>
          {department.hodUser ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 14px",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
              }}
            >
              <div className="nd-user-cell">
                <div className="nd-avatar" aria-hidden="true">
                  {department.hodUser.firstName[0]}
                  {department.hodUser.lastName[0]}
                </div>
                <div>
                  <div className="nd-cell-primary">
                    {department.hodUser.firstName} {department.hodUser.lastName}
                  </div>
                  <div className="nd-cell-secondary">{department.hodUser.email}</div>
                </div>
              </div>
              <Badge tone={department.hodUser.isActive ? "success" : "danger"}>
                {department.hodUser.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          ) : (
            <div className="nd-alert nd-alert-error" style={{ marginBottom: 0 }}>
              <span>No HOD user assigned. Contact your institutional administrator.</span>
            </div>
          )}
        </div>
      </Card>

      <div className="nd-section">
        <h2 className="nd-section-title">Department resources</h2>
        <div className="nd-stat-grid nd-stat-grid--3">
          <StatCard
            label="Classrooms"
            value={department.counts.classrooms}
            sub={`${department.counts.assignedClassrooms} with advisors · ${department.counts.unassignedClassrooms} unassigned`}
            icon={<GraduationCap style={{ width: 17, height: 17 }} />}
          />
          <StatCard
            label="Advisors"
            value={department.counts.advisors}
            sub="Faculty members with advisor profile"
            icon={<Users style={{ width: 17, height: 17 }} />}
          />
          <StatCard
            label="Students"
            value={department.counts.students}
            sub="Total student roster in department"
            icon={<Shield style={{ width: 17, height: 17 }} />}
          />
        </div>
      </div>
    </div>
  );
}
