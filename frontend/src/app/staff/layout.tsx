"use client";

import React from "react";
import AppShell from "@/components/layout/AppShell";
import {
  LayoutDashboard,
  School,
  BookOpen,
  GraduationCap,
  ClipboardCheck,
} from "lucide-react";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      allowedRoles={["STAFF"]}
      workspace="Faculty"
      tagline="Faculty Staff"
      nav={[
        { href: "/staff", label: "Dashboard", icon: LayoutDashboard, exact: true },
        { href: "/staff/classes", label: "My Classes", icon: School },
        { href: "/staff/subjects", label: "Assigned Subjects", icon: BookOpen },
        { href: "/staff/students", label: "Students", icon: GraduationCap },
        { href: "/staff/approvals", label: "Approvals", icon: ClipboardCheck },
      ]}
    >
      {children}
    </AppShell>
  );
}
