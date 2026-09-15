// ─── NDCP PDF Export Utility ────────────────────────────────────────────────
// Generates branded, properly-formatted PDF reports using jsPDF + jspdf-autotable.
// All generation happens client-side — no backend changes required.

import jsPDF from "jspdf";
import autoTable, { RowInput, CellDef } from "jspdf-autotable";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PdfReportOptions {
  /** PDF file name (without .pdf extension) */
  filename: string;
  /** Report title, e.g. "Classroom Defaulters List" */
  title: string;
  /** Subtitle line, e.g. "CS-A · Batch 2022 · Semester 6" */
  subtitle: string;
  /** Column headers */
  headers: string[];
  /** Data rows — each cell is a string */
  rows: string[][];
  /** Report type flavour for colour accents */
  type: "defaulters" | "clearance";
}

// ─── Colour palette ──────────────────────────────────────────────────────────

const PALETTE = {
  navy: [15, 23, 42] as [number, number, number],       // #0f172a
  blue: [29, 78, 216] as [number, number, number],       // #1d4ed8
  purple: [109, 40, 217] as [number, number, number],    // #6d28d9
  red: [220, 38, 38] as [number, number, number],        // #dc2626
  green: [22, 163, 74] as [number, number, number],      // #16a34a
  amber: [217, 119, 6] as [number, number, number],      // #d97706
  slate: [100, 116, 139] as [number, number, number],    // #64748b
  border: [226, 232, 240] as [number, number, number],   // #e2e8f0
  rowAlt: [248, 250, 252] as [number, number, number],   // #f8fafc
  white: [255, 255, 255] as [number, number, number],
  headerBg: [15, 23, 42] as [number, number, number],   // navy header
};

// ─── Status → colour mapping ─────────────────────────────────────────────────

function statusColor(val: string): [number, number, number] | null {
  const v = val.trim().toUpperCase();
  if (v === "CLEARED" || v === "APPROVED" || v === "YES") return PALETTE.green;
  if (v === "INCOMPLETE" || v === "REJECTED" || v === "NO") return PALETTE.red;
  if (v === "PENDING") return PALETTE.amber;
  return null;
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

export function parseCsvText(csv: string): { headers: string[]; rows: string[][] } {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 1) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let inQuote = false;
    let cell = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === "," && !inQuote) {
        result.push(cell);
        cell = "";
      } else {
        cell += ch;
      }
    }
    result.push(cell);
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).filter((l) => l.trim()).map(parseRow);
  return { headers, rows };
}

// ─── Main PDF generator ───────────────────────────────────────────────────────

export function generatePdfReport(options: PdfReportOptions): void {
  const { filename, title, subtitle, headers, rows, type } = options;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;

  // ─── Header band ─────────────────────────────────────────────────────────
  doc.setFillColor(...PALETTE.navy);
  doc.rect(0, 0, pageW, 28, "F");

  // Logo circle
  doc.setFillColor(...(type === "defaulters" ? PALETTE.red : PALETTE.blue));
  doc.circle(margin + 7, 14, 7, "F");
  doc.setTextColor(...PALETTE.white);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("NDCP", margin + 7, 14.8, { align: "center" });

  // Title
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PALETTE.white);
  doc.text(title, margin + 18, 12);

  // Subtitle
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 195, 215);
  doc.text(`No Due Clearance Portal  ·  ${subtitle}`, margin + 18, 19.5);

  // Generated timestamp (right-aligned)
  const now = new Date();
  const stamp = `Generated: ${now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}  ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  doc.setFontSize(7.5);
  doc.setTextColor(160, 180, 210);
  doc.text(stamp, pageW - margin, 19.5, { align: "right" });

  // Summary pill
  const cleared = rows.filter((r) => r.some((c) => c.toUpperCase() === "CLEARED" || c.toUpperCase() === "APPROVED")).length;
  const total = rows.length;
  doc.setFontSize(7.5);
  doc.setTextColor(180, 195, 215);
  doc.text(`${total} record${total !== 1 ? "s" : ""}  ·  ${cleared} cleared`, pageW - margin, 12, { align: "right" });

  // ─── Table ───────────────────────────────────────────────────────────────

  const tableBody: RowInput[] = rows.map((row) =>
    row.map((cell): CellDef => {
      const color = statusColor(cell);
      if (color) {
        return {
          content: cell,
          styles: {
            textColor: color,
            fontStyle: "bold",
          },
        };
      }
      return { content: cell };
    })
  );

  autoTable(doc, {
    head: [headers],
    body: tableBody,
    startY: 33,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      lineColor: PALETTE.border,
      lineWidth: 0.2,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: PALETTE.navy,
      textColor: PALETTE.white,
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
    },
    alternateRowStyles: {
      fillColor: PALETTE.rowAlt,
    },
    bodyStyles: {
      textColor: PALETTE.navy,
      halign: "left",
    },
    columnStyles: {
      // First column (Register No / ID) — monospace feel
      0: { fontStyle: "bold", cellWidth: "auto" },
    },
    didDrawPage: (data) => {
      // ── Footer on every page ─────────────────────────────────────────────
      const pageNum = (doc.internal as unknown as { getCurrentPageInfo: () => { pageNumber: number } }).getCurrentPageInfo().pageNumber;
      const totalPages = doc.getNumberOfPages();

      doc.setFillColor(...PALETTE.border);
      doc.rect(0, pageH - 10, pageW, 10, "F");

      doc.setFontSize(7);
      doc.setTextColor(...PALETTE.slate);
      doc.setFont("helvetica", "normal");
      doc.text("NDCP — No Due Clearance Portal · Confidential Academic Document", margin, pageH - 4);
      doc.text(`Page ${pageNum} of ${totalPages}`, pageW - margin, pageH - 4, { align: "right" });

      // Colour accent stripe at bottom
      doc.setFillColor(...(type === "defaulters" ? PALETTE.red : PALETTE.blue));
      doc.rect(0, pageH - 10, 3, 10, "F");

      void data; // suppress unused warning
    },
  });

  // ─── Save ─────────────────────────────────────────────────────────────────
  const dateStr = now.toISOString().split("T")[0];
  doc.save(`${filename}-${dateStr}.pdf`);
}
