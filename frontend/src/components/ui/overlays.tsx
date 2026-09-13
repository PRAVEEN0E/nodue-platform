"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number;
  testId?: string;
}

export function Modal({ title, description, onClose, children, footer, maxWidth = 560, testId }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="nd-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      {...(testId ? { "data-testid": testId } : {})}
    >
      <div className="nd-modal" style={{ maxWidth }}>
        <div className="nd-modal-header">
          <div>
            <h2 className="nd-modal-title">{title}</h2>
            {description && <p className="nd-modal-desc">{description}</p>}
          </div>
          <button className="nd-icon-btn" onClick={onClose} aria-label="Close dialog">
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>
        <div className="nd-modal-body">{children}</div>
        {footer && <div className="nd-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
