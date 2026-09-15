"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  UserRound,
  KeyRound,
  ShieldCheck,
  Laptop,
  Smartphone,
  Globe,
  AlertCircle,
  CheckCircle2,
  Lock,
  LogOut,
  RefreshCw,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import { PageHeader, Card, Button, Badge } from "@/components/ui/controls";
import { ButtonSpinner, PageLoader, EmptyState } from "@/components/ui/feedback";
import { useAuth } from "@/context/auth-context";
import {
  changePassword,
  getActiveSessions,
  revokeSession,
  revokeAllSessions,
} from "@/lib/auth-api";
import { UserSession } from "@/types/auth";
import { ApiError } from "@/lib/api";

const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
    confirmPassword: z.string().min(6, "Confirm password must be at least 6 characters"),
    keepCurrentSession: z.boolean().default(true),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords do not match",
    path: ["confirmPassword"],
  });

type ChangePasswordFormData = z.infer<typeof changePasswordFormSchema>;

function parseUserAgent(ua: string | null): { device: string; icon: "desktop" | "mobile" | "globe" } {
  if (!ua) return { device: "Unknown Browser / Client", icon: "globe" };

  let os = "Desktop";
  let isMobile = false;

  if (/windows/i.test(ua)) os = "Windows";
  else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) { os = "Android"; isMobile = true; }
  else if (/iphone|ipad|ipod/i.test(ua)) { os = "iOS"; isMobile = true; }
  else if (/linux/i.test(ua)) os = "Linux";

  let browser = "Browser";
  if (/edg/i.test(ua)) browser = "Edge";
  else if (/chrome/i.test(ua)) browser = "Chrome";
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
  else if (/firefox/i.test(ua)) browser = "Firefox";
  else if (/opera|opr/i.test(ua)) browser = "Opera";

  return {
    device: `${browser} on ${os}`,
    icon: isMobile ? "mobile" : "desktop",
  };
}

function calculateStrength(pwd: string): { score: number; label: string; color: string } {
  if (!pwd) return { score: 0, label: "", color: "#e2e8f0" };
  let score = 0;
  if (pwd.length >= 6) score += 1;
  if (pwd.length >= 8) score += 1;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
  if (/[0-9]/.test(pwd)) score += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

  if (score <= 2) return { score, label: "Weak", color: "#ef4444" };
  if (score <= 3) return { score, label: "Fair", color: "#f59e0b" };
  if (score <= 4) return { score, label: "Good", color: "#3b82f6" };
  return { score, label: "Strong", color: "#10b981" };
}

export default function ProfilePage() {
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<"overview" | "security" | "sessions">("overview");

  // Security / Password State
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Sessions State
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      keepCurrentSession: true,
    },
  });

  const newPasswordValue = watch("newPassword") || "";
  const strength = calculateStrength(newPasswordValue);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const data = await getActiveSessions();
      setSessions(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setSessionsError(err.message);
      } else {
        setSessionsError("Failed to retrieve active sessions.");
      }
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "sessions") {
      loadSessions();
    }
  }, [activeTab, loadSessions]);

  const onPasswordSubmit = async (data: ChangePasswordFormData) => {
    setPasswordError(null);
    setPasswordSuccess(null);
    setPasswordSubmitting(true);
    try {
      const res = await changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        keepCurrentSession: data.keepCurrentSession,
      });

      if (!data.keepCurrentSession) {
        await logout();
        return;
      }

      setPasswordSuccess(res.message);
      reset();
    } catch (err) {
      if (err instanceof ApiError) {
        setPasswordError(err.message);
      } else {
        setPasswordError("Failed to update password. Please check your connection.");
      }
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleRevokeSession = async (sessionId: string, isCurrent: boolean) => {
    setRevokingId(sessionId);
    try {
      await revokeSession(sessionId);
      if (isCurrent) {
        await logout();
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to revoke session");
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAll = async () => {
    if (!window.confirm("Are you sure you want to sign out all other devices? You will remain signed in only on this device.")) {
      return;
    }
    setRevokingAll(true);
    try {
      await revokeAllSessions(true);
      await loadSessions();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to revoke other sessions");
    } finally {
      setRevokingAll(false);
    }
  };

  if (!user) {
    return <PageLoader label="Loading profile…" />;
  }

  return (
    <div data-testid="profile-page">
      <PageHeader
        breadcrumb="Portal / Profile & Security"
        title={`${user.firstName} ${user.lastName}`}
        description={`${user.email} · Role: ${user.role}`}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge tone="info">{user.role}</Badge>
            {user.department && <span className="nd-code">{user.department.code}</span>}
          </div>
        }
      />

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #e2e8f0",
          gap: 24,
          marginBottom: 20,
        }}
      >
        <button
          onClick={() => setActiveTab("overview")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 4px",
            border: "none",
            borderBottom: activeTab === "overview" ? "2px solid #2563eb" : "2px solid transparent",
            color: activeTab === "overview" ? "#2563eb" : "#64748b",
            fontWeight: activeTab === "overview" ? 600 : 500,
            background: "transparent",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          <UserRound style={{ width: 16, height: 16 }} />
          Account Overview
        </button>

        <button
          onClick={() => setActiveTab("security")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 4px",
            border: "none",
            borderBottom: activeTab === "security" ? "2px solid #2563eb" : "2px solid transparent",
            color: activeTab === "security" ? "#2563eb" : "#64748b",
            fontWeight: activeTab === "security" ? 600 : 500,
            background: "transparent",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          <KeyRound style={{ width: 16, height: 16 }} />
          Password & Security
        </button>

        <button
          onClick={() => setActiveTab("sessions")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 4px",
            border: "none",
            borderBottom: activeTab === "sessions" ? "2px solid #2563eb" : "2px solid transparent",
            color: activeTab === "sessions" ? "#2563eb" : "#64748b",
            fontWeight: activeTab === "sessions" ? 600 : 500,
            background: "transparent",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          <ShieldCheck style={{ width: 16, height: 16 }} />
          Active Sessions & Devices
        </button>
      </div>

      {/* ─── TAB 1: OVERVIEW ────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="nd-two-col">
          <Card title="Personal Information" description="Identity records as registered in the institution.">
            <div style={{ marginTop: 4 }}>
              <div className="nd-def-row">
                <span className="nd-def-label">First Name</span>
                <span className="nd-def-value">{user.firstName}</span>
              </div>
              <div className="nd-def-row">
                <span className="nd-def-label">Last Name</span>
                <span className="nd-def-value">{user.lastName}</span>
              </div>
              <div className="nd-def-row">
                <span className="nd-def-label">Email</span>
                <span className="nd-def-value" style={{ fontFamily: "monospace", fontSize: 13 }}>
                  {user.email}
                </span>
              </div>
              <div className="nd-def-row">
                <span className="nd-def-label">Role</span>
                <span className="nd-def-value">
                  <Badge tone="info">{user.role}</Badge>
                </span>
              </div>
              <div className="nd-def-row">
                <span className="nd-def-label">Member Since</span>
                <span className="nd-def-value">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                </span>
              </div>
            </div>
          </Card>

          <Card title="Department & Placement" description="Institutional assignment.">
            <div style={{ marginTop: 4 }}>
              <div className="nd-def-row">
                <span className="nd-def-label">Department</span>
                <span className="nd-def-value">
                  {user.department ? `${user.department.code} · ${user.department.name}` : "Not Assigned"}
                </span>
              </div>

              {user.studentProfile && (
                <>
                  <div className="nd-def-row">
                    <span className="nd-def-label">Register Number</span>
                    <span className="nd-def-value" style={{ fontFamily: "monospace" }}>
                      {user.studentProfile.registerNumber}
                    </span>
                  </div>
                  {user.studentProfile.rollNumber && (
                    <div className="nd-def-row">
                      <span className="nd-def-label">Roll Number</span>
                      <span className="nd-def-value">{user.studentProfile.rollNumber}</span>
                    </div>
                  )}
                  {user.studentProfile.classroom && (
                    <div className="nd-def-row">
                      <span className="nd-def-label">Classroom</span>
                      <span className="nd-def-value">
                        {user.studentProfile.classroom.name} (Batch {user.studentProfile.classroom.batch})
                      </span>
                    </div>
                  )}
                </>
              )}

              {user.advisorProfile?.classroom && (
                <div className="nd-def-row">
                  <span className="nd-def-label">Assigned Class</span>
                  <span className="nd-def-value">
                    {user.advisorProfile.classroom.name} (Batch {user.advisorProfile.classroom.batch})
                  </span>
                </div>
              )}

              {user.staffProfile && (
                <>
                  <div className="nd-def-row">
                    <span className="nd-def-label">Employee Code</span>
                    <span className="nd-def-value" style={{ fontFamily: "monospace" }}>
                      {user.staffProfile.employeeCode}
                    </span>
                  </div>
                  <div className="nd-def-row">
                    <span className="nd-def-label">Designation</span>
                    <span className="nd-def-value">{user.staffProfile.designation}</span>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ─── TAB 2: SECURITY & PASSWORD ─────────────────────────────────── */}
      {activeTab === "security" && (
        <div style={{ maxWidth: 640 }}>
          <Card
            title="Change Password"
            description="Protect your account by regularly updating your credentials with a strong password."
          >
            {passwordSuccess && (
              <div
                className="nd-alert"
                style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", marginBottom: 16 }}
              >
                <CheckCircle2 style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1, color: "#16a34a" }} />
                <span>{passwordSuccess}</span>
              </div>
            )}

            {passwordError && (
              <div className="nd-alert nd-alert-error" role="alert" style={{ marginBottom: 16 }}>
                <AlertCircle style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
                <span>{passwordError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onPasswordSubmit)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="nd-label" htmlFor="current-password">
                  Current Password
                </label>
                <div style={{ position: "relative" }}>
                  <Lock
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 16,
                      height: 16,
                      color: "#94a3b8",
                    }}
                  />
                  <input
                    id="current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    {...register("currentPassword")}
                    placeholder="Enter current password"
                    className={`nd-input${errors.currentPassword ? " nd-input--error" : ""}`}
                    style={{ paddingLeft: 36, paddingRight: 36 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword((v) => !v)}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "#94a3b8",
                      padding: 0,
                    }}
                    aria-label={showCurrentPassword ? "Hide password" : "Show password"}
                  >
                    {showCurrentPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                  </button>
                </div>
                {errors.currentPassword && (
                  <p className="nd-field-error" role="alert">
                    {errors.currentPassword.message}
                  </p>
                )}
              </div>

              <div>
                <label className="nd-label" htmlFor="profile-new-password">
                  New Password
                </label>
                <div style={{ position: "relative" }}>
                  <Lock
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 16,
                      height: 16,
                      color: "#94a3b8",
                    }}
                  />
                  <input
                    id="profile-new-password"
                    type={showNewPassword ? "text" : "password"}
                    {...register("newPassword")}
                    placeholder="At least 6 characters"
                    className={`nd-input${errors.newPassword ? " nd-input--error" : ""}`}
                    style={{ paddingLeft: 36, paddingRight: 36 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "#94a3b8",
                      padding: 0,
                    }}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                  </button>
                </div>

                {newPasswordValue && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>Strength</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: strength.color }}>{strength.label}</span>
                    </div>
                    <div style={{ height: 4, width: "100%", background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${(strength.score / 5) * 100}%`,
                          background: strength.color,
                          transition: "width 0.2s ease",
                        }}
                      />
                    </div>
                  </div>
                )}

                {errors.newPassword && (
                  <p className="nd-field-error" role="alert">
                    {errors.newPassword.message}
                  </p>
                )}
              </div>

              <div>
                <label className="nd-label" htmlFor="profile-confirm-password">
                  Confirm New Password
                </label>
                <div style={{ position: "relative" }}>
                  <Lock
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 16,
                      height: 16,
                      color: "#94a3b8",
                    }}
                  />
                  <input
                    id="profile-confirm-password"
                    type="password"
                    {...register("confirmPassword")}
                    placeholder="Re-enter new password"
                    className={`nd-input${errors.confirmPassword ? " nd-input--error" : ""}`}
                    style={{ paddingLeft: 36 }}
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="nd-field-error" role="alert">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <input
                  type="checkbox"
                  id="keep-current-session"
                  {...register("keepCurrentSession")}
                  style={{ width: 16, height: 16, accentColor: "#2563eb", cursor: "pointer" }}
                />
                <label htmlFor="keep-current-session" style={{ fontSize: 13, color: "#334155", cursor: "pointer" }}>
                  Stay signed in on this device (revokes all other active sessions)
                </label>
              </div>

              <Button type="submit" disabled={passwordSubmitting} style={{ marginTop: 8 }}>
                {passwordSubmitting && <ButtonSpinner />}
                {passwordSubmitting ? "Updating Password…" : "Update Password"}
              </Button>
            </form>
          </Card>
        </div>
      )}

      {/* ─── TAB 3: ACTIVE SESSIONS & DEVICES ──────────────────────────── */}
      {activeTab === "sessions" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>
                Active Devices & Sessions ({sessions.length})
              </h2>
              <p style={{ fontSize: 13, color: "#64748b" }}>
                Manage browsers and devices currently signed into your account.
              </p>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={loadSessions} disabled={sessionsLoading}>
                <RefreshCw style={{ width: 14, height: 14 }} />
                Refresh
              </Button>

              {sessions.length > 1 && (
                <Button variant="danger" size="sm" onClick={handleRevokeAll} disabled={revokingAll}>
                  <LogOut style={{ width: 14, height: 14 }} />
                  {revokingAll ? "Signing Out Others…" : "Log Out Other Devices"}
                </Button>
              )}
            </div>
          </div>

          {sessionsError && (
            <div className="nd-alert nd-alert-error" role="alert" style={{ marginBottom: 16 }}>
              <AlertCircle style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
              <span>{sessionsError}</span>
            </div>
          )}

          {sessionsLoading ? (
            <PageLoader label="Loading active sessions…" />
          ) : sessions.length === 0 ? (
            <EmptyState
              title="No active sessions found"
              description="Your session list will appear here once refreshed."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sessions.map((session) => {
                const uaInfo = parseUserAgent(session.userAgent);
                return (
                  <div
                    key={session.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "14px 18px",
                      background: session.isCurrent ? "#f0fdf4" : "#ffffff",
                      border: session.isCurrent ? "1px solid #86efac" : "1px solid #e2e8f0",
                      borderRadius: 10,
                      gap: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: session.isCurrent ? "#dcfce7" : "#f1f5f9",
                          color: session.isCurrent ? "#15803d" : "#475569",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {uaInfo.icon === "mobile" ? (
                          <Smartphone style={{ width: 20, height: 20 }} />
                        ) : uaInfo.icon === "desktop" ? (
                          <Laptop style={{ width: 20, height: 20 }} />
                        ) : (
                          <Globe style={{ width: 20, height: 20 }} />
                        )}
                      </div>

                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}>
                            {uaInfo.device}
                          </span>
                          {session.isCurrent && (
                            <Badge tone="success">This Device</Badge>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 12.5, color: "#64748b", flexWrap: "wrap" }}>
                          <span>IP: <code style={{ fontFamily: "monospace", color: "#334155" }}>{session.ipAddress || "127.0.0.1"}</code></span>
                          <span>·</span>
                          <span>Signed in: {new Date(session.createdAt).toLocaleString()}</span>
                          <span>·</span>
                          <span>Expires: {new Date(session.expiresAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Button
                        variant={session.isCurrent ? "ghost" : "danger"}
                        size="sm"
                        disabled={revokingId === session.id}
                        onClick={() => handleRevokeSession(session.id, session.isCurrent)}
                        title={session.isCurrent ? "Sign out of this session" : "Revoke this device"}
                      >
                        {revokingId === session.id ? (
                          <ButtonSpinner />
                        ) : session.isCurrent ? (
                          <LogOut style={{ width: 14, height: 14 }} />
                        ) : (
                          <Trash2 style={{ width: 14, height: 14 }} />
                        )}
                        {session.isCurrent ? "Sign Out" : "Revoke"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @media (max-width: 900px) {
          .nd-two-col {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
