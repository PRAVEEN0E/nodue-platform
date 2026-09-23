"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/overlays";
import { Button, Badge } from "@/components/ui/controls";
import { StatusBadge } from "@/components/ui/status";
import { TableSkeleton, ErrorState, EmptyState } from "@/components/ui/feedback";
import type { StudentStatusSnapshot } from "@/lib/student-api";
import { ApiError } from "@/lib/api";
import { CheckCircle2, Clock, CircleDashed, XCircle, ExternalLink } from "lucide-react";

interface ClearanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  registerNumber: string;
  loadStatus: (id: string) => Promise<StudentStatusSnapshot>;
  fullPageUrl?: string;
}

type StageState = "complete" | "in-progress" | "blocked" | "not-started";

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
  state: StageState;
  stateLabel?: string;
}) {
  const Icon =
    state === "complete"
      ? CheckCircle2
      : state === "blocked"
      ? XCircle
      : state === "in-progress"
      ? Clock
      : CircleDashed;
  const color =
    state === "complete"
      ? "#16a34a"
      : state === "blocked"
      ? "#dc2626"
      : state === "in-progress"
      ? "#d97706"
      : "#94a3b8";
  const bg =
    state === "not-started"
      ? "#f1f5f9"
      : state === "complete"
      ? "#dcfce7"
      : state === "blocked"
      ? "#fee2e2"
      : "#fef3c7";

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid #f1f5f9",
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: bg,
          color,
        }}
      >
        <Icon style={{ width: 16, height: 16 }} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>
            STEP {index}
          </span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "#0f172a" }}>
            {title}
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: "#64748b", marginTop: 2, marginBottom: 0 }}>{desc}</p>
      </div>
      <span style={{ flexShrink: 0, alignSelf: "center" }}>
        <Badge
          tone={
            state === "complete"
              ? "success"
              : state === "blocked"
              ? "danger"
              : state === "in-progress"
              ? "warning"
              : "neutral"
          }
        >
          {stateLabel ??
            (state === "complete"
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

export function ClearanceModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  registerNumber,
  loadStatus,
  fullPageUrl,
}: ClearanceModalProps) {
  const router = useRouter();
  const [status, setStatus] = useState<StudentStatusSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !studentId) return;
    let active = true;
    setLoading(true);
    setError(null);
    loadStatus(studentId)
      .then((data) => {
        if (active) setStatus(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : "Failed to load status");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, studentId, loadStatus]);

  if (!isOpen) return null;

  const staffDone =
    status &&
    status.staffStage.total > 0 &&
    status.staffStage.subjects.every((s) => s.staffDecision === "APPROVED");
  const staffRejected = status?.staffStage.subjects.some((s) => s.staffDecision === "REJECTED");
  const staffState: StageState = !status || status.staffStage.total === 0
    ? "not-started"
    : staffDone
    ? "complete"
    : staffRejected
    ? "blocked"
    : "in-progress";
  const advisorState: StageState = !status
    ? "not-started"
    : status.advisorStage.decision === "APPROVED"
    ? "complete"
    : status.advisorStage.decision === "REJECTED"
    ? "blocked"
    : staffDone
    ? "in-progress"
    : "not-started";
  const hodState: StageState = !status
    ? "not-started"
    : status.hodStage.decision === "APPROVED"
    ? "complete"
    : status.hodStage.decision === "REJECTED"
    ? "blocked"
    : status.advisorStage.decision === "APPROVED"
    ? "in-progress"
    : "not-started";
  const feeState: StageState = status?.feeStage.satisfied ? "complete" : "in-progress";
  const finalState: StageState = !status
    ? "not-started"
    : status.finalVerification.state === "COMPLETE"
    ? "complete"
    : status.finalVerification.state === "READY"
    ? "in-progress"
    : "not-started";
  const finalStateLabel = !status
    ? "Not ready"
    : status.finalVerification.state === "COMPLETE"
    ? "Complete"
    : status.finalVerification.state === "READY"
    ? "Ready"
    : "Not ready";

  return (
    <Modal
      title={`Clearance Status — ${studentName}`}
      description={`Register No: ${registerNumber} · Live 5-stage clearance pipeline`}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
          {fullPageUrl ? (
            <Button
              variant="secondary"
              onClick={() => {
                onClose();
                router.push(fullPageUrl);
              }}
            >
              <ExternalLink style={{ width: 14, height: 14 }} />
              Open Full Page
            </Button>
          ) : (
            <div />
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {loading ? (
        <TableSkeleton rows={5} cols={2} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => loadStatus(studentId).then(setStatus)} />
      ) : !status ? (
        <EmptyState title="No record" description="No status record available for this student." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ padding: "0 4px" }}>
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
                  ? "Approved by class advisor."
                  : status.advisorStage.decision === "REJECTED"
                  ? "Rejected by class advisor."
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
                  ? "Approved by HOD."
                  : status.hodStage.decision === "REJECTED"
                  ? "Rejected by HOD."
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
                  ? "Fee requirements verified."
                  : "Awaiting fee verification by advisor or HOD."
              }
              state={feeState}
              stateLabel={status.feeStage.satisfied ? "Verified" : "Pending"}
            />
            <StageRow
              index={5}
              title="Final verification"
              desc={
                status.finalVerification.state === "COMPLETE"
                  ? "All clearance stages completed and verified."
                  : status.finalVerification.state === "READY"
                  ? "All prerequisite stages satisfied. Ready for final sign-off."
                  : "Awaiting prerequisite approval stages."
              }
              state={finalState}
              stateLabel={finalStateLabel}
            />
          </div>

          {status.staffStage.subjects.length > 0 && (
            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                Subject Approvals Breakdown
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {status.staffStage.subjects.map((sub) => (
                  <div
                    key={sub.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: "#f8fafc",
                    }}
                  >
                    <span style={{ fontSize: 13, color: "#1e293b" }}>
                      <span className="nd-code" style={{ marginRight: 6 }}>
                        {sub.code}
                      </span>
                      {sub.name}
                    </span>
                    <StatusBadge status={sub.staffDecision} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
