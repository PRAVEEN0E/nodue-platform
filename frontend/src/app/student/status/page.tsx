"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getStudentStatus, StudentStatusSnapshot } from "@/lib/student-api";
import { ApiError } from "@/lib/api";
import { RefreshCw, CheckCircle2, Clock, CircleDashed, XCircle } from "lucide-react";
import { Badge, PageHeader, Card, Button } from "@/components/ui/controls";import { StatusBadge } from "@/components/ui/status";
import { PageLoader, ErrorState, EmptyState } from "@/components/ui/feedback";

function StageRow({
  index,
  title,
  desc,
  state,
  stateLabel,
}: {
  index: number;
  title: string;
  desc: string;
  state: "complete" | "in-progress" | "blocked" | "not-started";
  stateLabel?: string;
}) {
  const Icon = state === "complete" ? CheckCircle2 : state === "blocked" ? XCircle : state === "in-progress" ? Clock : CircleDashed;
  const color = state === "complete" ? "#16a34a" : state === "blocked" ? "#dc2626" : state === "in-progress" ? "#d97706" : "#94a3b8";
  return (
    <div style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background:
            state === "not-started"
              ? "#f1f5f9"
              : state === "complete"
                ? "#dcfce7"
                : state === "blocked"
                  ? "#fee2e2"
                  : "#fef3c7",
          color,
        }}
      >
        <Icon style={{ width: 17, height: 17 }} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8" }}>STEP {index}</span>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: "#0f172a" }}>{title}</span>
        </div>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{desc}</p>
      </div>
      <span style={{ flexShrink: 0, alignSelf: "center" }}>
        <Badge
          tone={state === "complete" ? "success" : state === "blocked" ? "danger" : state === "in-progress" ? "warning" : "neutral"}
        >
          {stateLabel ?? (state === "complete"
            ? "Complete"
            : state === "blocked"
              ? "Blocked"
              : state === "in-progress"
                ? "In progress"
                : "Not started")}
        </Badge>
      </span>
    </div>
  );
}

export default function StudentStatusPage() {
  const [status, setStatus] = useState<StudentStatusSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStudentStatus();
      setStatus(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <PageLoader label="Loading verification status..." />;

  if (error || !status) {
    return (
      <div data-testid="student-status">
        <PageHeader breadcrumb="Student / Status" title="Verification Status" description="Your clearance progress" />
        <div className="nd-card"><ErrorState message={error ?? "Status unavailable"} onRetry={load} /></div>
      </div>
    );
  }

  const staffDone =
    status.staffStage.total > 0 &&
    status.staffStage.subjects.every((s) => s.staffDecision === "APPROVED");
  const staffRejected = status.staffStage.subjects.some((s) => s.staffDecision === "REJECTED");
  const staffState =
    status.staffStage.total === 0
      ? "not-started"
      : staffDone
        ? "complete"
        : staffRejected
          ? "blocked"
          : "in-progress";
  const advisorState =
    status.advisorStage.decision === "APPROVED"
      ? "complete"
      : status.advisorStage.decision === "REJECTED"
        ? "blocked"
        : staffDone
          ? "in-progress"
          : "not-started";
  const hodState =
    status.hodStage.decision === "APPROVED"
      ? "complete"
      : status.hodStage.decision === "REJECTED"
        ? "blocked"
        : status.advisorStage.decision === "APPROVED"
          ? "in-progress"
          : "not-started";
  const feeState = status.feeStage.satisfied ? "complete" : "in-progress";
  const finalState =
    status.finalVerification.state === "COMPLETE"
      ? "complete"
      : status.finalVerification.state === "READY"
        ? "in-progress"
        : "not-started";
  const finalStateLabel =
    status.finalVerification.state === "COMPLETE"
      ? "Complete"
      : status.finalVerification.state === "READY"
        ? "Ready"
        : "Not ready";
  const finalDesc =
    status.finalVerification.state === "COMPLETE"
      ? `Verified${status.finalVerification.verifiedAt ? ` on ${new Date(status.finalVerification.verifiedAt).toLocaleDateString("en-IN")}` : ""}.`
      : status.finalVerification.state === "READY"
        ? "All previous stages are satisfied. Ready for final verification."
        : "Waiting for all required approvals to be satisfied.";

  return (
    <div data-testid="student-status">
      <PageHeader
        breadcrumb="Student / Status"
        title="Verification Status"
        description="Your clearance progress across workflow stages."
        actions={
          <Button variant="secondary" onClick={load}>
            <RefreshCw style={{ width: 14, height: 14 }} />
            Refresh
          </Button>
        }
      />

      <Card title="Clearance pipeline" description="Stages unlock in order as earlier stages complete.">
        <div>
          <StageRow
            index={1}
            title="Subject approvals (staff review)"
            desc={
              status.staffStage.total === 0
                ? "No subjects assigned yet."
                : `${status.staffStage.decided} of ${status.staffStage.total} subjects decided.`
            }
            state={staffState}
          />
          <StageRow
            index={2}
            title="Advisor review"
            desc={
              status.advisorStage.decision === "APPROVED"
                ? "Approved by your advisor."
                : status.advisorStage.decision === "REJECTED"
                  ? "Rejected by your advisor. Contact them for next steps."
                  : staffDone
                    ? "Ready for advisor review."
                    : "Unlocks after all subjects are staff-approved."
            }
            state={advisorState}
          />
          <StageRow
            index={3}
            title="HOD review"
            desc={
              status.hodStage.decision === "APPROVED"
                ? "Approved by your HOD."
                : status.hodStage.decision === "REJECTED"
                  ? "Rejected by your HOD. Contact your department office."
                  : status.advisorStage.decision === "APPROVED"
                    ? "Ready for HOD review."
                    : "Unlocks after advisor approval."
            }
            state={hodState}
          />
          <StageRow
            index={4}
            title="Fee verification"
            desc={
              status.feeStage.satisfied
                ? "Completed by your advisor or HOD."
                : "Awaiting fee verification by your advisor or HOD."
            }
            state={feeState}
            stateLabel={status.feeStage.satisfied ? "Verified" : "Pending"}
          />
          <StageRow
            index={5}
            title="Final verification"
            desc={finalDesc}
            state={finalState}
            stateLabel={finalStateLabel}
          />
        </div>
      </Card>

      <div className="nd-section">
        <Card title="Subject detail" description="Per-subject staff decisions.">
          {status.staffStage.subjects.length === 0 ? (
            <EmptyState
              title="No approval records available"
              description="Subject decisions will appear here once your subjects are reviewed."
            />
          ) : (
            status.staffStage.subjects.map((s) => (
              <div className="nd-def-row" key={s.id}>
                <span className="nd-def-label">
                  <span className="nd-code" style={{ marginRight: 8 }}>{s.code}</span>
                  {s.name}
                </span>
                <span className="nd-def-value">
  <StatusBadge status={s.staffDecision} />
                </span>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
