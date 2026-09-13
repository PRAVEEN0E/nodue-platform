"use client";

import React from "react";
import AppShell from "@/components/layout/AppShell";
import {
  LayoutDashboard,
  UserRound,
  BookOpen,
  Flag,
} from "lucide-react";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      allowedRoles={["STUDENT"]}
      workspace="Student"
      tagline="Student Portal"
      nav={[
        { href: "/student", label: "Dashboard", icon: LayoutDashboard, exact: true },
        { href: "/student/profile", label: "Profile", icon: UserRound },
        { href: "/student/subjects", label: "Subjects", icon: BookOpen },
        { href: "/student/status", label: "Status", icon: Flag },
      ]}
    >
      {children}
    </AppShell>
  );
}
