"use client";

import React, { useState } from "react";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "../../context/auth-context";
import { ApiError } from "../../lib/api";
import { GraduationCap, Lock, Mail, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/controls";
import { ButtonSpinner } from "@/components/ui/feedback";

const loginFormSchema = z.object({
  email: z.string().min(2, "Please enter your email or register number").toLowerCase(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginFormSchema>;

export default function LoginPage() {
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(null);
    setSubmitting(true);
    try {
      await login(data.email, data.password);
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError("Failed to sign in. Please verify your connection.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="nd-login-wrap">
      <div className="nd-login-card">
        <div className="nd-login-brand">
          <div className="nd-brand-icon">
            <GraduationCap style={{ width: 22, height: 22 }} />
          </div>
          <div>
            <div className="nd-brand-name">NDCP</div>
            <div className="nd-brand-sub">No Due Clearance Portal</div>
          </div>
        </div>

        <div className="nd-login-header">
          <h1 className="nd-login-title">Sign in to your account</h1>
          <p className="nd-login-desc">Enter your credentials to access the clearance portal</p>
        </div>

        {serverError && (
          <div className="nd-alert nd-alert-error" role="alert">
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: "flex", flexDirection: "column", gap: 14 }} noValidate>
          <div>
            <label className="nd-label" htmlFor="login-email">
              Email or Register Number
            </label>
            <div style={{ position: "relative" }}>
              <Mail
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
                id="login-email"
                type="text"
                {...register("email")}
                placeholder="Email or Register Number"
                autoComplete="username"
                className={`nd-input${errors.email ? " nd-input--error" : ""}`}
                style={{ paddingLeft: 36 }}
              />
            </div>
            {errors.email && (
              <p className="nd-field-error" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label className="nd-label" htmlFor="login-password">
              Password
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
                id="login-password"
                type="password"
                {...register("password")}
                placeholder="Enter your password"
                autoComplete="current-password"
                className={`nd-input${errors.password ? " nd-input--error" : ""}`}
                style={{ paddingLeft: 36 }}
              />
            </div>
            {errors.password && (
              <p className="nd-field-error" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>

          <Button type="submit" disabled={submitting} style={{ width: "100%", marginTop: 4 }}>
            {submitting && <ButtonSpinner />}
            {submitting ? "Signing in…" : "Sign In"}
          </Button>
        </form>

        <p style={{ fontSize: 12.5, color: "#94a3b8", textAlign: "center", marginTop: 20 }}>
          Protected by your institution&apos;s access policy. Contact your administrator for
          account help.
        </p>
      </div>
    </div>
  );
}
