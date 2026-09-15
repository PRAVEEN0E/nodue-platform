"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { getUsers, getAdminDepartments, SafeUser, Department, Role, PaginationMeta } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { Search, RefreshCw, GraduationCap, Briefcase } from "lucide-react";
import { PageHeader, Badge, Button } from "@/components/ui/controls";
import { TableSkeleton, EmptyState, ErrorState, Pagination } from "@/components/ui/feedback";

const ROLES: Role[] = ["ADMIN", "HOD", "ADVISOR", "STAFF", "STUDENT"];

export default function UsersPage() {
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterRole, setFilterRole] = useState<Role | "">("");
  const [filterDept, setFilterDept] = useState("");
  const [filterActive, setFilterActive] = useState<"" | "true" | "false">("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const LIMIT = 20;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, depts] = await Promise.all([
        getUsers({
          page,
          limit: LIMIT,
          search: debouncedSearch || undefined,
          role: filterRole || undefined,
          departmentId: filterDept || undefined,
          isActive: filterActive || undefined,
        }),
        departments.length === 0 ? getAdminDepartments() : Promise.resolve(departments),
      ]);
      setUsers(res.data);
      setMeta(res.meta);
      if (departments.length === 0) setDepartments(depts as Department[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, filterRole, filterDept, filterActive]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFilter = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setPage(1);
    setter(e.target.value);
  };

  return (
    <div>
      <PageHeader
        breadcrumb="Admin / Users"
        title="Users"
        description={meta ? `${meta.total.toLocaleString()} total users` : "Loading…"}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href="/admin/students"
              className="nd-btn nd-btn-secondary"
              style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}
            >
              <GraduationCap style={{ width: 14, height: 14 }} />
              Bulk Import Students
            </Link>
            <Link
              href="/admin/staff"
              className="nd-btn nd-btn-secondary"
              style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}
            >
              <Briefcase style={{ width: 14, height: 14 }} />
              Bulk Import Staff
            </Link>
            <Button variant="secondary" onClick={load}>
              <RefreshCw style={{ width: 14, height: 14 }} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="nd-filter-bar" role="search">
        <div className="nd-search-wrap" style={{ flex: 2 }}>
          <Search className="nd-search-icon" style={{ width: 16, height: 16 }} />
          <input
            className="nd-input nd-search-input"
            placeholder="Search by name or email…"
            value={search}
            onChange={handleFilter((v) => setSearch(v))}
            aria-label="Search users"
          />
        </div>
        <select
          className="nd-select"
          style={{ width: "auto", minWidth: 140 }}
          value={filterRole}
          onChange={handleFilter((v) => setFilterRole(v as Role | ""))}
          aria-label="Filter by role"
        >
          <option value="">All Roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          className="nd-select"
          style={{ width: "auto", minWidth: 170 }}
          value={filterDept}
          onChange={handleFilter((v) => setFilterDept(v))}
          aria-label="Filter by department"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} — {d.name}
            </option>
          ))}
        </select>
        <select
          className="nd-select"
          style={{ width: "auto", minWidth: 130 }}
          value={filterActive}
          onChange={handleFilter((v) => setFilterActive(v as "" | "true" | "false"))}
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {error && !loading && (
        <div className="nd-card" style={{ marginBottom: 16 }}>
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : users.length === 0 ? (
        <div className="nd-table-card">
          <EmptyState
            title="No users found"
            description="No users match the current search and filters."
          />
        </div>
      ) : (
        <>
          <div className="nd-table-card">
            <div className="nd-table-scroll">
              <table className="nd-table" data-testid="admin-users-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="nd-user-cell">
                          <div className="nd-avatar" aria-hidden="true">
                            {u.firstName[0]}
                            {u.lastName[0]}
                          </div>
                          <span className="nd-cell-primary">
                            {u.firstName} {u.lastName}
                          </span>
                        </div>
                      </td>
                      <td className="nd-cell-secondary">{u.email}</td>
                      <td>
                        <Badge tone="info">{u.role}</Badge>
                      </td>
                      <td>
                        {u.department ? (
                          <span className="nd-code">{u.department.code}</span>
                        ) : (
                          <span className="nd-cell-secondary">—</span>
                        )}
                      </td>
                      <td>
                        <Badge tone={u.isActive ? "success" : "danger"}>
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="nd-cell-secondary">
                        {new Date(u.createdAt).toLocaleDateString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {meta && (
              <Pagination
                page={meta.page}
                totalPages={meta.totalPages}
                total={meta.total}
                unit="users"
                onChange={(p) => setPage(p)}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
