"use client";

import React, { useEffect } from "react";
import { useAuth } from "../../context/auth-context";
import { useRouter } from "next/navigation";
import { Role } from "../../types/auth";
import { Loader2 } from "lucide-react";

export function getRoleHome(role?: string | null): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "HOD":
      return "/hod";
    case "ADVISOR":
      return "/advisor";
    case "STAFF":
      return "/staff";
    case "STUDENT":
      return "/student";
    default:
      return "/login";
  }
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated || !user) {
        router.replace("/login");
      } else if (allowedRoles && !allowedRoles.includes(user.role)) {
        router.replace(getRoleHome(user.role));
      }
    }
  }, [loading, isAuthenticated, user, allowedRoles, router]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: "#2563eb" }} />
          <p style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>Verifying authorization…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: "#2563eb" }} />
          <p style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>Redirecting to your workspace…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
