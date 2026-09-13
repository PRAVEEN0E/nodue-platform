"use client";

import React from "react";
import { AlertCircle, Inbox, Loader2, Dot } from "lucide-react";
import { Button } from "./controls";

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="nd-loading" role="status" aria-live="polite">
      <span className="nd-spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ButtonSpinner() {
  return <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" aria-hidden="true" />;
}

export function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="nd-card" aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="nd-skeleton" style={{ height: 18, width: "40%" }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="nd-skeleton" style={{ height: 14, width: `${92 - i * 9}%` }} />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="nd-table-card" aria-hidden="true" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="nd-skeleton" style={{ height: 18, width: "25%" }} />
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: "flex", gap: 10 }}>
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="nd-skeleton" style={{ height: 16, flex: 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="nd-empty">
      <div className="nd-empty-icon">
        <Inbox style={{ width: 22, height: 22 }} />
      </div>
      <div className="nd-empty-title">{title}</div>
      {description && <p className="nd-empty-desc">{description}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="nd-empty" role="alert">
      <div className="nd-empty-icon" style={{ background: "#fee2e2", color: "#dc2626" }}>
        <AlertCircle style={{ width: 22, height: 22 }} />
      </div>
      <div className="nd-empty-title">Something went wrong</div>
      <p className="nd-empty-desc">{message}</p>
      {onRetry && (
        <div style={{ marginTop: 8 }}>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

export interface ActivityItem {
  id: string;
  icon?: React.ComponentType<{ style?: React.CSSProperties }>;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
  title: string;
  /** Single-word, subtle status chip (premium feed style). */
  label?: string;
  /** Legacy alias for `label` (kept for existing callers). */
  badge?: string;
  detail?: string;
  /** Legacy alias for `detail` (kept for existing callers). */
  sub?: string;
  time?: string;
}

const toneClass: Record<string, string> = {
  success: "nd-badge-success",
  warning: "nd-badge-warning",
  danger: "nd-badge-danger",
  info: "nd-badge-info",
  neutral: "nd-badge-neutral",
};

const iconBg: Record<string, string> = {
  success: "#dcfce7",
  warning: "#fef3c7",
  danger: "#fee2e2",
  info: "#dbeafe",
  neutral: "#f1f5f9",
};

const iconColor: Record<string, string> = {
  success: "#16a34a",
  warning: "#b45309",
  danger: "#dc2626",
  info: "#1d4ed8",
  neutral: "#64748b",
};

export function ActivityList({ items, emptyText = "No recent activity." }: { items: ActivityItem[]; emptyText?: string }) {
  if (items.length === 0) {
    return <p className="nd-cell-secondary" style={{ padding: "8px 0" }}>{emptyText}</p>;
  }
  return (
    <div className="nd-activity-feed">
      {items.map((item, index) => {
        const tone = item.tone ?? "neutral";
        const Icon = item.icon ?? Dot;
        const label = item.label ?? item.badge;
        const detail = item.detail ?? item.sub;
        const isLast = index === items.length - 1;
        return (
          <div key={item.id} className="nd-activity-item">
            <div className="nd-activity-rail" aria-hidden="true">
              <span
                className="nd-activity-dot"
                style={{ background: iconBg[tone], color: iconColor[tone] }}
              >
                <Icon style={{ width: 15, height: 15 }} />
              </span>
              {!isLast && <span className="nd-activity-line" />}
            </div>
            <div className="nd-activity-body">
              <div className="nd-activity-top">
                <span className="nd-activity-title">{item.title}</span>
                {label && <span className={`nd-badge ${toneClass[tone]} nd-activity-chip`}>{label}</span>}
              </div>
              {detail && <p className="nd-activity-sub">{detail}</p>}
            </div>
            {item.time && <span className="nd-activity-time">{item.time}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  unit,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  unit: string;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="nd-pagination">
      <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span className="nd-pagination-info">
        Page {page} of {totalPages} · {total.toLocaleString()} {unit}
      </span>
      <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </div>
  );
}
