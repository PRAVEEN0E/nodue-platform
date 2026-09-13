"use client";

import { Loader2 } from "lucide-react";

export default function RootPage() {
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
        <p style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>Redirecting…</p>
      </div>
    </div>
  );
}
