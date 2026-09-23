"use client";

import React from "react";
import AppShell from "@/components/layout/AppShell";
import {
  LayoutDashboard,
  Building2,
  GraduationCap,
  Users,
  UserCheck,
  FileText,
  ClipboardCheck,
  Wallet,
} from "lucide-react";

export default function HodLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      allowedRoles={["HOD"]}
      workspace="Department"
      tagline="Head of Department"
      nav={[
        { href: "/hod", label: "Dashboard", icon: LayoutDashboard, exact: true },
        { href: "/hod/department", label: "Department", icon: Building2 },
        { href: "/hod/classrooms", label: "Classrooms", icon: GraduationCap },
        { href: "/hod/advisors", label: "Advisors", icon: Users },
        { href: "/hod/students", label: "Students", icon: UserCheck },
        { href: "/hod/approvals", label: "Approvals", icon: ClipboardCheck },
        { href: "/hod/fees", label: "Fees", icon: Wallet },
        { href: "/hod/audit-logs", label: "Audit Logs", icon: FileText },
      ]}
    >
      {children}
    </AppShell>
  );
}
