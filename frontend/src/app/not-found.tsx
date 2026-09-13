"use client";

import React from "react";
import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div className="nd-card" style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <div className="nd-empty-icon" style={{ margin: "0 auto 4px" }}>
          <FileQuestion style={{ width: 22, height: 22 }} />
        </div>
        <h1 style={{ fontSize: 19, fontWeight: 600, color: "#0f172a" }}>Page not found</h1>
        <p style={{ fontSize: 13.5, color: "#64748b", marginTop: 6 }}>
          The requested page does not exist or you do not have permission to view it.
        </p>
        <div style={{ marginTop: 18 }}>
          <Link href="/" className="nd-btn nd-btn-primary">
            <Home style={{ width: 14, height: 14 }} />
            Return to workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
