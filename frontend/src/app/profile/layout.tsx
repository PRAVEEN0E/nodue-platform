"use client";

import React from "react";
import AppShell from "@/components/layout/AppShell";
import { UserRound, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { getRoleHome } from "@/components/auth/ProtectedRoute";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const roleHome = getRoleHome(user?.role ?? null);

  return (
    <AppShell
      allowedRoles={["ADMIN", "HOD", "ADVISOR", "STAFF", "STUDENT"]}
      workspace="Account"
      tagline="Profile & Security"
      nav={[
        { href: roleHome, label: "Back to Dashboard", icon: ArrowLeft, exact: true },
        { href: "/profile", label: "Profile & Security", icon: UserRound, exact: true },
      ]}
    >
      {children}
    </AppShell>
  );
}
