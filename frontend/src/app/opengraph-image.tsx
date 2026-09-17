import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "NoDue Platform — Academic Clearance Portal (NDCP)";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #1d4ed8 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 80px",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              color: "#ffffff",
            }}
          >
            🎓
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em" }}>NDCP</span>
            <span style={{ fontSize: 16, color: "#93c5fd", fontWeight: 500 }}>No Due Clearance Portal</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 960 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "rgba(37, 99, 235, 0.3)",
              border: "1px solid rgba(147, 197, 253, 0.4)",
              borderRadius: 999,
              padding: "6px 18px",
              color: "#bfdbfe",
              fontSize: 16,
              fontWeight: 600,
              width: "auto",
              alignSelf: "flex-start",
            }}
          >
            One Portal. Zero Pending.
          </div>
          <h1
            style={{
              fontSize: 52,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              margin: 0,
              color: "#ffffff",
            }}
          >
            Automated Academic Clearances & Departmental Sign-offs
          </h1>
          <p style={{ fontSize: 22, color: "#cbd5e1", margin: 0, lineHeight: 1.4 }}>
            Next-generation university clearance platform for students, faculty advisors, department heads, and administration.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid rgba(255, 255, 255, 0.15)",
            paddingTop: 24,
            fontSize: 16,
            color: "#94a3b8",
          }}
        >
          <span>nodue-platform.vercel.app</span>
          <span>Fast • Transparent • Paperless</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
