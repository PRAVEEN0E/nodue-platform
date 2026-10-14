"use client";

import React from "react";
import { Search, X, FilterX } from "lucide-react";

export interface TabCountMap {
  pending?: number;
  approved?: number;
  rejected?: number;
  decided?: number;
  [key: string]: number | undefined;
}

export interface ApprovalFilterTab<T extends string = string> {
  key: T;
  label: string;
}

export interface ApprovalFilterBarProps<T extends string = string> {
  search: string;
  onSearchChange: (val: string) => void;
  statusFilter: T;
  onStatusChange: (status: T) => void;
  counts?: TabCountMap;
  placeholder?: string;
  tabs?: ApprovalFilterTab<T>[];
  defaultStatus?: T;
}

const DEFAULT_TABS: ApprovalFilterTab[] = [
  { key: "pending", label: "Pending review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "decided", label: "All decided" },
];

export function ApprovalFilterBar<T extends string = string>({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  counts,
  placeholder = "Search by student name or register number...",
  tabs = DEFAULT_TABS as ApprovalFilterTab<T>[],
  defaultStatus = "pending" as T,
}: ApprovalFilterBarProps<T>) {
  const isFiltered = search.trim().length > 0 || statusFilter !== defaultStatus;

  const handleClear = () => {
    onSearchChange("");
    onStatusChange(defaultStatus);
  };

  return (
    <div className="nd-filter-bar" role="search" aria-label="Filter approvals">
      <div className="nd-filter-tabs" role="tablist" aria-label="Filter by decision status">
        {tabs.map((tab) => {
          const isActive = statusFilter === tab.key;
          const count = counts?.[tab.key];
          return (
            <button
              key={tab.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              className={`nd-filter-tab nd-filter-tab--${tab.key} ${isActive ? "nd-filter-tab--active" : ""}`}
              onClick={() => onStatusChange(tab.key)}
            >
              <span>{tab.label}</span>
              {typeof count === "number" && (
                <span className="nd-filter-tab-count" title={`${count} records`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 240, maxWidth: 450 }}>
        <div className="nd-search-wrap">
          <Search className="nd-search-icon" style={{ width: 16, height: 16 }} />
          <input
            className="nd-input nd-search-input"
            placeholder={placeholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search records"
          />
          {search && (
            <button
              type="button"
              className="nd-search-clear"
              onClick={() => onSearchChange("")}
              aria-label="Clear search input"
              title="Clear search"
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>

        {isFiltered && (
          <button
            type="button"
            className="nd-btn nd-btn-ghost nd-btn-sm"
            onClick={handleClear}
            style={{ color: "var(--nd-muted)", whiteSpace: "nowrap" }}
            title="Reset filters to default"
          >
            <FilterX style={{ width: 14, height: 14 }} />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
