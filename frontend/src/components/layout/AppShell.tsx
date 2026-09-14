"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, LogOut, Menu, X } from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/context/auth-context";
import { Role } from "@/types/auth";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

interface AppShellProps {
  allowedRoles: Role[];
  workspace: string;
  tagline: string;
  nav: NavItem[];
  children: React.ReactNode;
}

function formatCrumb(segment: string): string {
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function AppShell({
  allowedRoles,
  workspace,
  tagline,
  nav,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  // NOTE: No `mounted` guard here by design. Every node rendered below is
  // SSR-deterministic (static nav config, usePathname, initial auth state),
  // so the server HTML and the first client render always match. Auth resolves
  // after hydration inside ProtectedRoute, which renders its own deterministic
  // loading shell meanwhile. A client-only `mounted` boolean would diverge
  // from the server under Fast Refresh (preserved hook state) and recreate
  // the hydration mismatch this shell exists to prevent.
  const crumbs = pathname.split("/").filter(Boolean);
  const initials = user ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() : "–";

  return (
    <ProtectedRoute allowedRoles={allowedRoles}>
      <div className="nd-shell">
        {sidebarOpen && (
          <div
            className="nd-sidebar-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside className={`nd-sidebar${sidebarOpen ? " nd-sidebar--open" : ""}`} aria-label="Primary navigation">
          <div className="nd-brand">
            <div className="nd-brand-icon">
              <GraduationCap style={{ width: 20, height: 20 }} />
            </div>
            <div>
              <div className="nd-brand-name">NDCP</div>
              <div className="nd-brand-sub">No Due Clearance Portal</div>
            </div>
            <button
              className="nd-icon-btn nd-sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close navigation menu"
              style={{ marginLeft: "auto" }}
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
          </div>

          <nav className="nd-nav" id="nd-primary-nav">
            <div className="nd-nav-section">{workspace}</div>
            {nav.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`nd-nav-link${isActive ? " nd-nav-link--active" : ""}`}
                >
                  <Icon className="nd-nav-icon" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="nd-sidebar-footer">
            <div className="nd-user-chip">
              <div className="nd-avatar" aria-hidden="true">{initials}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="nd-user-name">
                  {user ? `${user.firstName} ${user.lastName}` : "—"}
                </div>
                <div className="nd-user-role">{user?.role ?? tagline}</div>
              </div>
              <button
                className="nd-icon-btn"
                onClick={() => logout()}
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut style={{ width: 16, height: 16 }} />
              </button>
            </div>
          </div>
        </aside>

        <div className="nd-main">
          <header className="nd-topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <button
                className="nd-icon-btn nd-menu-btn"
                onClick={() => setSidebarOpen((v) => !v)}
                aria-label="Open navigation menu"
                aria-expanded={sidebarOpen}
                aria-controls="nd-primary-nav"
              >
                <Menu style={{ width: 18, height: 18 }} />
              </button>
              <span className="nd-topbar-title">
                NDCP
                {crumbs.map((c, i) => (
                  <span key={i}>
                    {"  /  "}
                    {formatCrumb(c)}
                  </span>
                ))}
              </span>
            </div>
            <div className="nd-topbar-actions">
              <div className="nd-avatar" aria-hidden="true">{initials}</div>
              <div className="hidden sm:block" style={{ lineHeight: 1.25 }}>
                <div className="nd-user-name">
                  {user ? `${user.firstName} ${user.lastName}` : "—"}
                </div>
                <div className="nd-user-role">{user?.role ?? ""}</div>
              </div>
            </div>
          </header>

          <main className="nd-content">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
