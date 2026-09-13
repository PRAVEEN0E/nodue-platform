"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "nd-btn",
        variant === "primary" && "nd-btn-primary",
        variant === "secondary" && "nd-btn-secondary",
        variant === "ghost" && "nd-btn-ghost",
        variant === "danger" && "nd-btn-danger",
        size === "sm" && "nd-btn-sm",
        className
      )}
      {...props}
    />
  );
}

interface LinkButtonProps {
  href: string;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  className?: string;
  children: React.ReactNode;
}

export function LinkButton({ href, variant = "primary", size = "md", className, children }: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={cn(
        "nd-btn",
        variant === "primary" && "nd-btn-primary",
        variant === "secondary" && "nd-btn-secondary",
        variant === "ghost" && "nd-btn-ghost",
        variant === "danger" && "nd-btn-danger",
        size === "sm" && "nd-btn-sm",
        className
      )}
    >
      {children}
    </Link>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  htmlFor?: string;
}

function FieldShell({ label, error, hint, htmlFor, children }: FieldProps & { children: React.ReactNode }) {
  const id = htmlFor;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <label className="nd-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error && (
        <p className="nd-field-error" role="alert">
          {error}
        </p>
      )}
      {!error && hint && <p className="nd-hint">{hint}</p>}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, id, className, ...props }: InputProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={id}>
      <input id={id} className={cn("nd-input", error && "nd-input--error", className)} {...props} />
    </FieldShell>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function Select({ label, error, hint, id, className, children, ...props }: SelectProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} htmlFor={id}>
      <select id={id} className={cn("nd-select", error && "nd-select--error", className)} {...props}>
        {children}
      </select>
    </FieldShell>
  );
}

export function Badge({ tone = "neutral", testId, children }: { tone?: BadgeTone; testId?: string; children: React.ReactNode }) {
  return (
    <span
      {...(testId ? { "data-testid": testId } : {})}
      className={cn(
        "nd-badge",
        tone === "success" && "nd-badge-success",
        tone === "warning" && "nd-badge-warning",
        tone === "danger" && "nd-badge-danger",
        tone === "info" && "nd-badge-info",
        tone === "neutral" && "nd-badge-neutral"
      )}
    >
      <span className="nd-badge-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="nd-card">
      {(title || actions) && (
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: children ? 14 : 0 }}>
          <div>
            {title && <h2 className="nd-card-title">{title}</h2>}
            {description && <p className="nd-card-desc">{description}</p>}
          </div>
          {actions && <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="nd-stat">
      <div className="nd-stat-top">
        <span className="nd-stat-label">{label}</span>
        {icon && <span className="nd-stat-icon">{icon}</span>}
      </div>
      <div className="nd-stat-value">{value}</div>
      {sub && <div className="nd-stat-sub">{sub}</div>}
    </div>
  );
}

export function PageHeader({
  breadcrumb,
  title,
  description,
  actions,
}: {
  breadcrumb?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div>
      {breadcrumb && <nav className="nd-breadcrumb" aria-label="Breadcrumb">{breadcrumb}</nav>}
      <div className="nd-page-head">
        <div>
          <h1 className="nd-page-title">{title}</h1>
          {description && <p className="nd-page-desc">{description}</p>}
        </div>
        {actions && <div className="nd-page-actions">{actions}</div>}
      </div>
    </div>
  );
}
