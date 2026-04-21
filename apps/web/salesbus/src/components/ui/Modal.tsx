"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect } from "react";

interface ModalProps {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export function Modal({ isOpen, onClose, children, title }: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      {/* Backdrop */}
      <button
        aria-label="Close modal"
        className="absolute inset-0 animate-[fadeIn_0.2s_ease-out] cursor-default bg-black/50"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onClose();
          }
        }}
        type="button"
      />

      {/* Modal Content - Bottom sheet on mobile, centered on tablet+ */}
      <div
        aria-labelledby={title ? "modal-title" : undefined}
        aria-modal="true"
        className="relative z-10 max-h-[85vh] w-full max-w-lg animate-[slideUp_0.3s_ease-out] overflow-y-auto rounded-t-2xl bg-[var(--color-surface)] shadow-lg sm:max-h-[80vh] sm:max-w-xl sm:rounded-2xl"
        role="dialog"
      >
        {/* Close button - 48px touch target */}
        <button
          aria-label="Close"
          className="absolute top-3 right-3 z-10 flex h-12 w-12 touch-manipulation items-center justify-center rounded-full bg-gray-100 text-[var(--color-text-secondary)] transition-colors hover:bg-gray-200 hover:text-[var(--color-text-primary)] active:bg-gray-300"
          onClick={onClose}
          type="button"
        >
          <X className="h-6 w-6" />
        </button>

        {title && (
          <h2
            className="px-5 pt-5 font-semibold text-[var(--color-text-primary)] text-lg sm:px-6 sm:pt-6 sm:text-xl"
            id="modal-title"
          >
            {title}
          </h2>
        )}

        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
