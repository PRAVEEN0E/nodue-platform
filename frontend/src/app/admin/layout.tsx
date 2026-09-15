"use client";

import React from "react";
import AppShell from "@/components/layout/AppShell";
import {
  LayoutDashboard,
  Building2,
  UserCog,
  Users,
  Briefcase,
  FileText,
} from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      allowedRoles={["ADMIN"]}
      workspace="Administration"
      tagline="System Administrator"
      nav={[
        { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
        { href: "/admin/departments", label: "Departments", icon: Building2 },
        { href: "/admin/hods", label: "HODs", icon: UserCog },
        { href: "/admin/staff", label: "Staff", icon: Briefcase },
        { href: "/admin/users", label: "Users", icon: Users },
        { href: "/admin/audit-logs", label: "Audit Logs", icon: FileText },
      ]}
    >
      {children}
    </AppShell>
  );
}
