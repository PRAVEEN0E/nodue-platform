"use client";

import React from "react";
import AppShell from "@/components/layout/AppShell";
import {
  LayoutDashboard,
  GraduationCap,
  Briefcase,
  BookOpen,
  Wallet,
  ClipboardCheck,
  BadgeCheck,
} from "lucide-react";

export default function AdvisorLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      allowedRoles={["ADVISOR"]}
      workspace="Advisor"
      tagline="Classroom Advisor"
      nav={[
        { href: "/advisor", label: "Dashboard", icon: LayoutDashboard, exact: true },
        { href: "/advisor/students", label: "Students", icon: GraduationCap },
        { href: "/advisor/staff", label: "Staff Assignment", icon: Briefcase },
        { href: "/advisor/subjects", label: "Subjects", icon: BookOpen },
        { href: "/advisor/fees", label: "Fees", icon: Wallet },
        { href: "/advisor/approvals", label: "Approvals", icon: ClipboardCheck },
        { href: "/advisor/final-verification", label: "Final Verification", icon: BadgeCheck },
      ]}
    >
      {children}
    </AppShell>
  );
}
