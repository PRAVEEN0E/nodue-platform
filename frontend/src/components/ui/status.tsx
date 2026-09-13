"use client";

import { Badge } from "./controls";
import { cn } from "@/lib/utils";

/**
 * Centralized status presentation for the NoDue workflow.
 *
 * DESIGN RULE: API status literals (DecisionStatus, AdvisorQueueStatus,
 * HodQueueStatus, finalVerification.state, user.isActive) are NEVER shown
 * raw to a user. This module is the single place that converts a literal
 * into a human-readable label + a presentation tone. It NEVER changes the
 * API literal, the business logic, or the approval engine — it only changes
 * how a status is presented.
 *
 * All tones reuse the existing `nd-badge-*` classes (Badge already renders
 * a tone-colored `nd-badge-dot` via currentColor), so no new CSS is needed.
 */

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

/** Normalize any API literal (upper/snake/kebab/lower) into a lookup key. */
export function normalizeStatus(value?: string | null): string {
  if (!value) return "";
  return value.trim().toUpperCase().replace(/[-\s]+/g, "_");
}

const STATUS_LABELS: Record<string, string> = {
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PENDING: "Pending",
  DECIDED: "Decided",
  VERIFIED: "Verified",
  DECISION_VERIFIED: "Decision verified",
  COMPLETE: "Complete",
  SUCCESS: "Complete",
  IN_PROGRESS: "In progress",
  NOT_STARTED: "Not started",
  READY: "Ready",
  NOT_READY: "Not ready",
  FINAL_VERIFIED: "Final verified",
  FINAL_VERIFICATION_COMPLETE: "Final verification complete",
  PENDING_REVIEW: "Pending review",
  REVIEWED: "Reviewed",
  PENDING_VERIFICATION: "Pending verification",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ENABLED: "Active",
  DISABLED: "Inactive",
  UNASSIGNED: "Unassigned",
  NOT_ASSIGNED: "Not assigned",
  LOCKED: "Locked",
  APPROVED_PENDING_FEE: "Approved – pending fee",
  PENDING_FEE_VERIFICATION: "Pending fee verification",
  FEE_VERIFICATION_PENDING: "Fee verification pending",
  FEE_VERIFIED: "Fee verified",
  NO_DUE_FINAL: "NoDue final",
  ON_HOLD: "On hold",
  BLOCKED: "Blocked",
  REJECTED_FINAL: "Rejected – final",
  ASSIGNED: "Assigned",
  SCHEDULED: "Scheduled",
  SUBMITTED: "Submitted",
  REVIEW: "Review",
  UNDER_REVIEW: "Under review",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

/** Presentation tone per status literal (neutral = "no value yet"). */
const STATUS_TONES: Record<string, StatusTone> = {
  APPROVED: "success",
  REJECTED: "danger",
  PENDING: "warning",
  DECIDED: "success",
  VERIFIED: "success",
  DECISION_VERIFIED: "success",
  COMPLETE: "success",
  SUCCESS: "success",
  IN_PROGRESS: "info",
  NOT_STARTED: "neutral",
  READY: "info",
  NOT_READY: "neutral",
  FINAL_VERIFIED: "success",
  FINAL_VERIFICATION_COMPLETE: "success",
  PENDING_REVIEW: "warning",
  REVIEWED: "info",
  PENDING_VERIFICATION: "warning",
  ACTIVE: "success",
  INACTIVE: "neutral",
  ENABLED: "success",
  DISABLED: "neutral",
  UNASSIGNED: "neutral",
  NOT_ASSIGNED: "neutral",
  LOCKED: "neutral",
  APPROVED_PENDING_FEE: "warning",
  PENDING_FEE_VERIFICATION: "warning",
  FEE_VERIFICATION_PENDING: "warning",
  FEE_VERIFIED: "success",
  ON_HOLD: "warning",
  BLOCKED: "danger",
  REJECTED_FINAL: "danger",
  ASSIGNED: "success",
  SCHEDULED: "info",
  SUBMITTED: "info",
  REVIEW: "warning",
  UNDER_REVIEW: "warning",
  RESOLVED: "success",
  CLOSED: "neutral",
};

/** Human-readable label for a status literal (fallback: title-cased). */
export function humanizeStatus(value?: string | null): string {
  const key = normalizeStatus(value);
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  if (!value) return "—";
  const cleaned = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "—";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Presentation tone for a status literal (fallback: neutral). */
export function statusTone(value?: string | null): StatusTone {
  return STATUS_TONES[normalizeStatus(value)] ?? "neutral";
}

interface StatusBadgeProps {
  status?: string | null;
  label?: string;
  tone?: StatusTone;
  testId?: string;
  className?: string;
}

/**
 * Consistent status badge used everywhere in NoDue. Pass `status` (API
 * literal) or `label` for custom wording; `tone` overrides auto-detection.
 * Renders through Badge so it always carries the nd-badge-* vocabulary.
 */
export function StatusBadge({ status, label, tone, testId, className }: StatusBadgeProps) {
  const toneResolved = tone ?? statusTone(status);
  return (
    <span className={className}>
      <Badge tone={toneResolved} testId={testId}>
        {label ?? humanizeStatus(status)}
      </Badge>
    </span>
  );
}

interface StatusPillProps {
  active?: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
  activeTone?: StatusTone;
  inactiveTone?: StatusTone;
  testId?: string;
}

/**
 * Two-state Active/Inactive-style pill with clear neutral vocabulary for the
 * "no value yet" case. Pass explicit labels so "Inactive" (a real deactivated
 * state) is never confused with "Unassigned"/"No data".
 */
export function StatusPill({
  active,
  activeLabel = "Active",
  inactiveLabel = "Inactive",
  activeTone = "success",
  inactiveTone = "neutral",
  testId,
}: StatusPillProps) {
  return <StatusBadge status={active ? "ACTIVE" : "INACTIVE"} label={active ? activeLabel : inactiveLabel} tone={active ? activeTone : inactiveTone} testId={testId} />;
}

interface StatusDotProps {
  status?: string | null;
  tone?: StatusTone;
  className?: string;
}

/** Inline status dot (uses design tokens, no new CSS). */
export function StatusDot({ status, tone, className }: StatusDotProps) {
  const toneResolved = tone ?? statusTone(status);
  const color = {
    success: "var(--nd-success)",
    warning: "var(--nd-warning)",
    danger: "var(--nd-error)",
    info: "var(--nd-blue)",
    neutral: "var(--nd-faint)",
  }[toneResolved];
  return <span className={cn("nd-status-dot", className)} style={{ backgroundColor: color }} aria-hidden="true" />;
}
