"use client";

import React, { useState, useRef } from "react";
import { Modal } from "./overlays";
import { BulkImportResult } from "../../lib/bulk-api";
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Play,
  RotateCcw,
} from "lucide-react";

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  entityName: string;
  onDownloadTemplate: () => Promise<void>;
  onUpload: (file: File, dryRun: boolean) => Promise<BulkImportResult>;
  onSuccess?: () => void;
}

export function BulkImportModal({
  isOpen,
  onClose,
  title,
  entityName,
  onDownloadTemplate,
  onUpload,
  onSuccess,
}: BulkImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const resetState = () => {
    setFile(null);
    setResult(null);
    setGeneralError(null);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setGeneralError(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      if (dropped.name.endsWith(".csv") || dropped.type === "text/csv") {
        setFile(dropped);
        setResult(null);
        setGeneralError(null);
      } else {
        setGeneralError("Please upload a valid .csv file.");
      }
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      await onDownloadTemplate();
    } catch {
      setGeneralError("Failed to download CSV template.");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleDryRun = async () => {
    if (!file) return;
    setIsUploading(true);
    setGeneralError(null);
    try {
      const res = await onUpload(file, true);
      setResult(res);
    } catch (err: unknown) {
      setGeneralError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCommitImport = async () => {
    if (!file) return;
    setIsUploading(true);
    setGeneralError(null);
    try {
      const res = await onUpload(file, false);
      setResult(res);
      if (res.errors.length === 0) {
        onSuccess?.();
      }
    } catch (err: unknown) {
      setGeneralError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Modal
      title={title}
      description={`Upload a CSV file to bulk import ${entityName.toLowerCase()} with automatic validation.`}
      onClose={handleClose}
      maxWidth={640}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Template download banner */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--nd-blue-soft)",
            border: "1px solid var(--nd-blue-border)",
            borderRadius: "var(--nd-radius-md)",
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FileSpreadsheet style={{ width: 20, height: 20, color: "var(--nd-blue)" }} />
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--nd-blue-dark)" }}>
                Need the standard CSV format?
              </div>
              <div style={{ fontSize: 12, color: "var(--nd-muted)" }}>
                Download a pre-formatted template with headers and examples.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="nd-btn nd-btn-outline"
            style={{
              padding: "6px 12px",
              fontSize: 12.5,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#fff",
            }}
            onClick={handleDownloadTemplate}
            disabled={downloadingTemplate}
          >
            <Download style={{ width: 14, height: 14 }} />
            {downloadingTemplate ? "Downloading..." : "Template"}
          </button>
        </div>

        {/* Upload Dropzone */}
        {!result?.inserted ? (
          <div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? "var(--nd-blue)" : "var(--nd-border-strong)"}`,
                borderRadius: "var(--nd-radius-md)",
                background: isDragging ? "var(--nd-blue-soft)" : "var(--nd-bg)",
                padding: "28px 20px",
                textAlign: "center",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
              <UploadCloud
                style={{
                  width: 36,
                  height: 36,
                  color: isDragging ? "var(--nd-blue)" : "var(--nd-muted)",
                  margin: "0 auto 10px",
                }}
              />
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--nd-navy)" }}>
                {file ? file.name : "Click to browse or drag and drop CSV"}
              </div>
              <div style={{ fontSize: 12, color: "var(--nd-muted)", marginTop: 4 }}>
                {file ? `${(file.size / 1024).toFixed(1)} KB` : "Supports UTF-8 CSV files up to 5MB"}
              </div>
            </div>

            {file && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 10,
                  padding: "8px 12px",
                  background: "#f1f5f9",
                  borderRadius: "var(--nd-radius-sm)",
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 500, color: "var(--nd-navy)" }}>{file.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetState();
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--nd-error)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                  }}
                >
                  <Trash2 style={{ width: 14, height: 14 }} /> Remove
                </button>
              </div>
            )}
          </div>
        ) : null}

        {/* General Error Banner */}
        {generalError && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              background: "var(--nd-error-bg)",
              borderRadius: "var(--nd-radius-sm)",
              color: "var(--nd-error)",
              fontSize: 13,
            }}
          >
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span>{generalError}</span>
          </div>
        )}

        {/* Validation / Execution Results */}
        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Summary counters */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  padding: "10px",
                  background: "var(--nd-bg)",
                  borderRadius: "var(--nd-radius-sm)",
                  border: "1px solid var(--nd-border)",
                }}
              >
                <div style={{ fontSize: 11.5, color: "var(--nd-muted)", fontWeight: 500 }}>
                  Total Rows
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--nd-navy)" }}>
                  {result.total}
                </div>
              </div>
              <div
                style={{
                  padding: "10px",
                  background: "var(--nd-success-bg)",
                  borderRadius: "var(--nd-radius-sm)",
                  border: "1px solid #bbf7d0",
                }}
              >
                <div style={{ fontSize: 11.5, color: "#166534", fontWeight: 500 }}>
                  {result.dryRun ? "Valid Rows" : "Imported"}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#15803d" }}>
                  {result.dryRun ? result.valid : result.inserted}
                </div>
              </div>
              <div
                style={{
                  padding: "10px",
                  background: result.errors.length > 0 ? "var(--nd-error-bg)" : "var(--nd-bg)",
                  borderRadius: "var(--nd-radius-sm)",
                  border: `1px solid ${result.errors.length > 0 ? "#fecaca" : "var(--nd-border)"}`,
                }}
              >
                <div
                  style={{
                    fontSize: 11.5,
                    color: result.errors.length > 0 ? "#991b1b" : "var(--nd-muted)",
                    fontWeight: 500,
                  }}
                >
                  Errors
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: result.errors.length > 0 ? "var(--nd-error)" : "var(--nd-muted)",
                  }}
                >
                  {result.errors.length}
                </div>
              </div>
            </div>

            {/* Error Table */}
            {result.errors.length > 0 && (
              <div
                style={{
                  border: "1px solid #fecaca",
                  borderRadius: "var(--nd-radius-sm)",
                  maxHeight: 180,
                  overflowY: "auto",
                  background: "#fff",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    fontSize: 12,
                    borderCollapse: "collapse",
                    textAlign: "left",
                  }}
                >
                  <thead style={{ background: "#fef2f2", position: "sticky", top: 0 }}>
                    <tr>
                      <th style={{ padding: "6px 10px", color: "#991b1b" }}>Row</th>
                      <th style={{ padding: "6px 10px", color: "#991b1b" }}>Field</th>
                      <th style={{ padding: "6px 10px", color: "#991b1b" }}>Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((err, idx) => (
                      <tr key={idx} style={{ borderTop: "1px solid #fee2e2" }}>
                        <td style={{ padding: "6px 10px", fontWeight: 600 }}>{err.row}</td>
                        <td style={{ padding: "6px 10px", color: "var(--nd-muted)" }}>{err.field}</td>
                        <td style={{ padding: "6px 10px", color: "var(--nd-error)" }}>
                          {err.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Success message after commit */}
            {!result.dryRun && result.inserted > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 16px",
                  background: "var(--nd-success-bg)",
                  borderRadius: "var(--nd-radius-md)",
                  color: "#15803d",
                  fontSize: 13.5,
                  fontWeight: 500,
                }}
              >
                <CheckCircle2 style={{ width: 18, height: 18, flexShrink: 0 }} />
                <span>
                  Successfully imported {result.inserted} {entityName.toLowerCase()}!
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            paddingTop: 12,
            borderTop: "1px solid var(--nd-border)",
          }}
        >
          <button
            type="button"
            className="nd-btn nd-btn-outline"
            onClick={handleClose}
            disabled={isUploading}
          >
            {result && !result.dryRun ? "Done" : "Cancel"}
          </button>

          {file && (!result || (result.dryRun && result.errors.length > 0)) && (
            <button
              type="button"
              className="nd-btn nd-btn-outline"
              onClick={handleDryRun}
              disabled={isUploading}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <RotateCcw style={{ width: 14, height: 14 }} />
              {isUploading ? "Validating..." : "Validate CSV"}
            </button>
          )}

          {file && result?.dryRun && result.errors.length === 0 && (
            <button
              type="button"
              className="nd-btn nd-btn-primary"
              onClick={handleCommitImport}
              disabled={isUploading}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Play style={{ width: 14, height: 14 }} />
              {isUploading ? "Importing..." : `Import ${result.valid} ${entityName}`}
            </button>
          )}

          {file && !result && (
            <button
              type="button"
              className="nd-btn nd-btn-primary"
              onClick={handleDryRun}
              disabled={isUploading}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Play style={{ width: 14, height: 14 }} />
              {isUploading ? "Checking..." : "Validate & Preview"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
