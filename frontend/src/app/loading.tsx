import React from "react";
import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: "#2563eb" }} />
      <span style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>Loading workspace…</span>
    </div>
  );
}
