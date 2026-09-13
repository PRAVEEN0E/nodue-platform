"use client";

import React, { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error boundary triggered:", error);
  }, [error]);

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
        <div className="nd-empty-icon" style={{ margin: "0 auto 4px", background: "#fee2e2", color: "#dc2626" }}>
          <AlertCircle style={{ width: 22, height: 22 }} />
        </div>
        <h1 style={{ fontSize: 19, fontWeight: 600, color: "#0f172a" }}>Something went wrong</h1>
        <p style={{ fontSize: 13.5, color: "#64748b", marginTop: 6 }}>
          An unexpected error occurred. Try again or return to your dashboard.
        </p>
        <div style={{ marginTop: 18 }}>
          <button onClick={() => reset()} className="nd-btn nd-btn-primary">
            <RefreshCw style={{ width: 14, height: 14 }} />
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
