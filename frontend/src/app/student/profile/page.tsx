"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getStudentProfile, StudentProfile } from "@/lib/student-api";
import { ApiError } from "@/lib/api";
import { RefreshCw } from "lucide-react";
import { PageHeader, Card, Button, Badge } from "@/components/ui/controls";
import { PageLoader, ErrorState } from "@/components/ui/feedback";

export default function StudentProfilePage() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getStudentProfile();
      setProfile(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoader label="Loading profile…" />;

  if (error || !profile) {
    return (
      <div data-testid="student-profile">
        <PageHeader breadcrumb="Student / Profile" title="Profile" description="Your record" />
        <Card>
          <ErrorState message={error ?? "Profile not found"} onRetry={load} />
        </Card>
      </div>
    );
  }

  return (
    <div data-testid="student-profile">
      <PageHeader
        breadcrumb="Student / Profile"
        title={`${profile.user.firstName} ${profile.user.lastName}`}
        description={`${profile.registerNumber} · ${profile.user.email}`}
        actions={
          <Button variant="secondary" onClick={load}>
            <RefreshCw style={{ width: 14, height: 14 }} />
            Refresh
          </Button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="nd-two-col">
        <Card title="Personal information" description="As recorded by your institution.">
          <div style={{ marginTop: 4 }}>
            <div className="nd-def-row"><span className="nd-def-label">Full name</span><span className="nd-def-value">{profile.user.firstName} {profile.user.lastName}</span></div>
            <div className="nd-def-row"><span className="nd-def-label">Email</span><span className="nd-def-value" style={{ fontFamily: "monospace", fontSize: 13 }}>{profile.user.email}</span></div>
            <div className="nd-def-row"><span className="nd-def-label">Register number</span><span className="nd-def-value" style={{ fontFamily: "monospace", fontSize: 13 }}>{profile.registerNumber}</span></div>
            {profile.rollNumber && (
              <div className="nd-def-row"><span className="nd-def-label">Roll number</span><span className="nd-def-value">{profile.rollNumber}</span></div>
            )}
            <div className="nd-def-row"><span className="nd-def-label">Admission year</span><span className="nd-def-value">{profile.admissionYear}</span></div>
            <div className="nd-def-row">
              <span className="nd-def-label">Status</span>
              <span className="nd-def-value">
                <Badge tone={profile.user.isActive ? "success" : "danger"}>{profile.user.isActive ? "Enrolled" : "Inactive"}</Badge>
              </span>
            </div>
          </div>
        </Card>

        <Card title="Academic placement" description="Your classroom and department.">
          <div style={{ marginTop: 4 }}>
            <div className="nd-def-row"><span className="nd-def-label">Classroom</span><span className="nd-def-value">{profile.classroom.name}</span></div>
            <div className="nd-def-row"><span className="nd-def-label">Batch</span><span className="nd-def-value">{profile.classroom.batch}</span></div>
            <div className="nd-def-row">
              <span className="nd-def-label">Semester / Section</span>
              <span className="nd-def-value">{profile.classroom.semester} / {profile.classroom.section}</span>
            </div>
            <div className="nd-def-row"><span className="nd-def-label">Department</span><span className="nd-def-value">{profile.classroom.department.code} · {profile.classroom.department.name}</span></div>
          </div>
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
