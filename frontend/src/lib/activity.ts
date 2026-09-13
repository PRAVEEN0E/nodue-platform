import type { ActivityItem } from "@/components/ui/feedback";
import {
  UserPlus,
  UserCheck,
  UserX,
  ShieldCheck,
  ShieldAlert,
  BadgeCheck,
  BookOpen,
  Pencil,
  GraduationCap,
  Building2,
  CheckCircle2,
  XCircle,
  LogIn,
  LogOut,
  CircleDot,
  type LucideIcon,
} from "lucide-react";

/**
 * Presentation-only mapping for the Recent Activity feed.
 *
 * CONTRACT (never violated here):
 *   - No UUIDs, internal database/entity ids, or raw entityType model names
 *     (e.g. `Student · 78809ec2`) are ever rendered.
 *   - No emails (PII) are rendered.
 *   - Only a safe allow-list of business metadata drives copy:
 *     subjectCode / actorRole / isActive. Everything else in `metadata` is
 *     ignored so raw event data can never leak into the UI.
 */

export interface ActivityLogLike {
  id: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actorUser?: { firstName?: string | null; lastName?: string | null; role?: string } | null;
}

const ROLE_NOUN: Record<string, string> = {
  ADMIN: "Admin",
  HOD: "HOD",
  ADVISOR: "Advisor",
  STAFF: "Staff",
  STUDENT: "Student",
};

function actorName(log: ActivityLogLike): string {
  const a = log.actorUser;
  if (a) {
    const name = [a.firstName, a.lastName].filter(Boolean).join(" ").trim();
    if (name) return name;
    if (a.role && ROLE_NOUN[a.role]) return ROLE_NOUN[a.role];
  }
  return "System";
}

function safeStr(meta: Record<string, unknown> | null | undefined, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim() ? (v as string).trim() : null;
}

function safeBool(meta: Record<string, unknown> | null | undefined, key: string): boolean | null {
  const v = meta?.[key];
  return typeof v === "boolean" ? (v as boolean) : null;
}

function prettify(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function fmtTime(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function humanizeActivity(log: ActivityLogLike): ActivityItem {
  const action = log.action ?? "";
  const actor = actorName(log);
  const meta = log.metadata ?? null;
  const code = safeStr(meta, "subjectCode");
  const base: Pick<ActivityItem, "id" | "time"> = {
    id: log.id,
    time: fmtTime(log.createdAt),
  };
  const branded = (icon: LucideIcon, tone: ActivityItem["tone"], label: string, title: string, detail: string): ActivityItem => ({
    ...base,
    icon,
    tone,
    label,
    title,
    detail,
  });

  const byAction: Record<string, () => ActivityItem> = {
    AUTH_LOGIN: () => branded(LogIn, "info", "Sign-in", "Signed in", `${actor} signed in`),
    AUTH_LOGOUT: () => branded(LogOut, "neutral", "Sign-out", "Signed out", `${actor} signed out`),
    AUTH_TOKEN_REUSE_DETECTED: () =>
      branded(ShieldAlert, "danger", "Security", "Security alert", "Suspected token reuse was detected"),
    HOD_CREATED: () =>
      branded(UserPlus, "success", "Created", "HOD created", "An HOD was assigned to a department"),
    HOD_ACTIVATED: () =>
      branded(UserCheck, "success", "Active", "HOD activated", `${actor} activated an HOD account`),
    HOD_DEACTIVATED: () =>
      branded(UserX, "danger", "Inactive", "HOD deactivated", `${actor} deactivated an HOD account`),
    DEPARTMENT_UPDATED: () =>
      branded(Building2, "info", "Updated", "Department updated", `${actor} updated department details`),
    CLASSROOM_CREATED: () => branded(GraduationCap, "success", "Created", "Classroom created", `${actor} created a classroom`),
    CLASSROOM_UPDATED: () => branded(Pencil, "info", "Updated", "Classroom updated", `${actor} updated classroom details`),
    ADVISOR_CREATED: () => branded(UserCheck, "success", "Created", "Advisor created", `${actor} created an advisor account`),
    ADVISOR_UPDATED: () => branded(Pencil, "info", "Updated", "Advisor updated", `${actor} updated advisor details`),
    ADVISOR_ASSIGNED: () =>
      branded(UserCheck, "info", "Assigned", "Advisor assigned", `${actor} assigned an advisor to a classroom`),
    ADVISOR_UNASSIGNED: () =>
      branded(UserX, "info", "Unassigned", "Advisor unassigned", `${actor} removed an advisor from a classroom`),
    USER_STATUS_UPDATED: () => {
      const active = safeBool(meta, "isActive");
      return active === false
        ? branded(UserX, "danger", "Inactive", "User deactivated", `${actor} deactivated a user account`)
        : branded(UserCheck, "success", "Active", "User activated", `${actor} activated a user account`);
    },
    STUDENT_CREATED: () => branded(UserPlus, "success", "Created", "Student created", `${actor} created a new student`),
    STUDENT_UPDATED: () => branded(Pencil, "info", "Updated", "Student updated", `${actor} updated a student's details`),
    STAFF_CREATED: () => branded(UserPlus, "success", "Created", "Staff created", `${actor} created a staff account`),
    STAFF_UPDATED: () =>
      branded(Pencil, "info", "Updated", "Staff updated", code ? `${actor} updated staff account ${code}` : `${actor} updated staff details`),
    STAFF_ACTIVATED: () => branded(UserCheck, "success", "Active", "Staff activated", `${actor} activated a staff account`),
    STAFF_DEACTIVATED: () => branded(UserX, "danger", "Inactive", "Staff deactivated", `${actor} deactivated a staff account`),
    STAFF_DELETED: () =>
      branded(UserX, "danger", "Deleted", "Staff removed", code ? `${actor} deleted staff account ${code}` : `${actor} deleted a staff account`),
    SUBJECT_CREATED: () =>
      branded(BookOpen, "success", "Created", "Subject created", code ? `${actor} added subject ${code}` : `${actor} created a subject`),
    SUBJECT_UPDATED: () => branded(Pencil, "info", "Updated", "Subject updated", `${actor} updated subject details`),
    SUBJECT_STAFF_MAPPED: () =>
      branded(
        BookOpen,
        "info",
        "Assigned",
        "Subject staff assigned",
        code ? `${actor} assigned a staff member to ${code}` : `${actor} assigned a staff member to a subject`
      ),
    SUBJECT_STAFF_UNMAPPED: () =>
      branded(BookOpen, "info", "Unassigned", "Subject staff unassigned", `${actor} removed a staff member from a subject`),
    ADVISOR_APPROVED: () =>
      branded(UserCheck, "success", "Approved", "Advisor approval completed", `${actor} approved the student's NoDue request`),
    ADVISOR_REJECTED: () =>
      branded(UserX, "danger", "Rejected", "Advisor approval rejected", `${actor} rejected the student's NoDue request`),
    HOD_APPROVED: () =>
      branded(ShieldCheck, "success", "Approved", "HOD approval completed", `${actor} approved the student's NoDue request`),
    HOD_REJECTED: () =>
      branded(ShieldAlert, "danger", "Rejected", "HOD approval rejected", `${actor} rejected the student's NoDue request`),
    FEE_APPROVED: () =>
      branded(BadgeCheck, "success", "Verified", "Fee verification completed", `${actor} verified the student's fee status`),
    FINAL_VERIFIED: () =>
      branded(BadgeCheck, "success", "Verified", "Final verification completed", `${actor} completed a student's NoDue verification`),
    STAFF_APPROVAL_APPROVED: () => branded(CheckCircle2, "success", "Approved", "Subject approved", `${actor} approved a subject`),
    STAFF_APPROVAL_REJECTED: () => branded(XCircle, "danger", "Rejected", "Subject rejected", `${actor} rejected a subject approval`),
  };

  const build =
    byAction[action] ??
    (() => ({
      icon: fallbackIcon(action),
      tone: fallbackTone(action),
      label: fallbackLabel(action),
      title: prettify(action),
      detail: `${actor} performed this action`,
    }));
  return { ...base, ...build() };
}

function fallbackIcon(action: string): LucideIcon {
  const upper = action.toUpperCase();
  if (/REJECTED|DEACTIVATED|FAILED/.test(upper)) return XCircle;
  if (/APPROVED|VERIFIED|ACTIVATED|CREATED/.test(upper)) return CheckCircle2;
  if (/UPDATED|ASSIGNED|UNASSIGNED/.test(upper)) return Pencil;
  return CircleDot;
}

function fallbackTone(action: string): ActivityItem["tone"] {
  const upper = action.toUpperCase();
  if (/REJECTED|DEACTIVATED|FAILED/.test(upper)) return "danger";
  if (/APPROVED|VERIFIED|ACTIVATED|CREATED/.test(upper)) return "success";
  if (/UPDATED|ASSIGNED|UNASSIGNED/.test(upper)) return "info";
  return "neutral";
}

function fallbackLabel(action: string): string {
  const upper = action.toUpperCase();
  if (/REJECTED|DEACTIVATED|FAILED/.test(upper)) return "Rejected";
  if (/APPROVED|VERIFIED|ACTIVATED|CREATED/.test(upper)) return "Completed";
  if (/UPDATED|ASSIGNED/.test(upper)) return /UNASSIGNED/.test(upper) ? "Unassigned" : "Updated";
  return "Event";
}