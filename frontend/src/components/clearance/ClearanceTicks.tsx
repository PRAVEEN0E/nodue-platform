"use client";

import React from "react";
import { Check, X, Clock, Minus, CircleDashed } from "lucide-react";
import type { ClearanceStepSummary } from "@/lib/advisor-api";

interface ClearanceTicksProps {
  clearance?: ClearanceStepSummary | null;
  onClick?: () => void;
  showLabels?: boolean;
}

type StepState = "approved" | "rejected" | "partial" | "pending" | "empty";

interface StepConfig {
  key: string;
  shortLabel: string;
  fullLabel: string;
  state: StepState;
  tooltip: string;
}

export function ClearanceTicks({ clearance, onClick, showLabels = true }: ClearanceTicksProps) {
  if (!clearance) {
    return <span className="nd-cell-secondary" style={{ fontSize: 12 }}>—</span>;
  }

  const { staff, advisor, hod, fee, final } = clearance;

  // Step 1: Staff
  let staffState: StepState = "pending";
  let staffTooltip = "Staff review pending";
  if (staff.status === "APPROVED") {
    staffState = "approved";
    staffTooltip = `Staff: ${staff.approved}/${staff.total} subjects approved`;
  } else if (staff.status === "REJECTED") {
    staffState = "rejected";
    staffTooltip = "Staff: One or more subjects rejected";
  } else if (staff.status === "PARTIAL") {
    staffState = "partial";
    staffTooltip = `Staff: ${staff.approved}/${staff.total} subjects approved (in progress)`;
  } else if (staff.status === "NO_SUBJECTS") {
    staffState = "empty";
    staffTooltip = "Staff: No subjects assigned";
  }

  // Step 2: Advisor
  const advisorState: StepState =
    advisor.status === "APPROVED"
      ? "approved"
      : advisor.status === "REJECTED"
      ? "rejected"
      : "pending";
  const advisorTooltip = `Advisor: ${advisor.status === "APPROVED" ? "Approved" : advisor.status === "REJECTED" ? "Rejected" : "Pending"}`;

  // Step 3: HOD
  const hodState: StepState =
    hod.status === "APPROVED"
      ? "approved"
      : hod.status === "REJECTED"
      ? "rejected"
      : "pending";
  const hodTooltip = `HOD: ${hod.status === "APPROVED" ? "Approved" : hod.status === "REJECTED" ? "Rejected" : "Pending"}`;

  // Step 4: Fee
  const feeState: StepState = fee.satisfied ? "approved" : "pending";
  const feeTooltip = `Fee: ${fee.satisfied ? "Verified" : "Pending"}`;

  // Step 5: Final
  const finalState: StepState =
    final.state === "COMPLETE"
      ? "approved"
      : final.state === "READY"
      ? "partial"
      : "pending";
  const finalTooltip = `Final: ${final.state === "COMPLETE" ? "Verified & Complete" : final.state === "READY" ? "Ready for verification" : "Pending"}`;

  const steps: StepConfig[] = [
    { key: "staff", shortLabel: "Staff", fullLabel: "Subject Staff", state: staffState, tooltip: staffTooltip },
    { key: "advisor", shortLabel: "Adv", fullLabel: "Class Advisor", state: advisorState, tooltip: advisorTooltip },
    { key: "hod", shortLabel: "HOD", fullLabel: "Head of Dept", state: hodState, tooltip: hodTooltip },
    { key: "fee", shortLabel: "Fee", fullLabel: "Fee Clearance", state: feeState, tooltip: feeTooltip },
    { key: "final", shortLabel: "Final", fullLabel: "Final Verification", state: finalState, tooltip: finalTooltip },
  ];

  const getStateStyle = (state: StepState) => {
    switch (state) {
      case "approved":
        return {
          bg: "#dcfce7",
          color: "#15803d",
          border: "#86efac",
          icon: Check,
        };
      case "rejected":
        return {
          bg: "#fee2e2",
          color: "#b91c1c",
          border: "#fca5a5",
          icon: X,
        };
      case "partial":
        return {
          bg: "#fef3c7",
          color: "#b45309",
          border: "#fde68a",
          icon: Clock,
        };
      case "empty":
        return {
          bg: "#f1f5f9",
          color: "#94a3b8",
          border: "#e2e8f0",
          icon: Minus,
        };
      case "pending":
      default:
        return {
          bg: "#f8fafc",
          color: "#94a3b8",
          border: "#e2e8f0",
          icon: CircleDashed,
        };
    }
  };

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      title={onClick ? "Click to view full clearance pipeline" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        cursor: onClick ? "pointer" : "default",
        padding: "3px 6px",
        borderRadius: 8,
        transition: "background-color 0.15s ease, transform 0.1s ease",
        userSelect: "none",
      }}
      className="clearance-ticks-container hover:bg-slate-100"
    >
      {steps.map((step) => {
        const style = getStateStyle(step.state);
        const Icon = style.icon;
        return (
          <span
            key={step.key}
            title={step.tooltip}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontSize: 11,
              fontWeight: 600,
              padding: showLabels ? "2px 5px 2px 4px" : "2px",
              borderRadius: 6,
              background: style.bg,
              color: style.color,
              border: `1px solid ${style.border}`,
              lineHeight: 1,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon style={{ width: 10, height: 10, strokeWidth: 3 }} />
            </span>
            {showLabels && <span>{step.shortLabel}</span>}
          </span>
        );
      })}
    </div>
  );
}
