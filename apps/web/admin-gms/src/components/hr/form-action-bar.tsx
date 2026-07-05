"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { Spinner } from "@grenmet/ui/components/ui/spinner";
import { Download, RotateCcw, Save, Send } from "lucide-react";
import type { ReactNode } from "react";

interface FormActionBarProps {
  isSaving?: boolean;
  isSubmitting?: boolean;
  onDownloadPdf: () => void;
  onReset: () => void;
  /** Omit to hide the Save button (e.g. print-only editors with no draft). */
  onSave?: () => void;
  /** Omit to hide the Submit button (e.g. print-only editors). */
  onSubmit?: () => void;
  saveDisabled?: boolean;
  /** Short status note, e.g. "Draft saved just now". */
  statusHint?: ReactNode;
  submitDisabled?: boolean;
}

/**
 * Unified action bar for document editors: Reset · Save (draft) · Download PDF ·
 * Submit. Submit is the primary action; Save persists a server-side draft. Save
 * and Submit are hidden when their handlers are omitted (print-only editors).
 * Email is not a button here — it is sent automatically once an approved
 * request reaches HR.
 */
export function FormActionBar({
  onReset,
  onSave,
  onSubmit,
  onDownloadPdf,
  isSaving = false,
  isSubmitting = false,
  statusHint,
  saveDisabled = false,
  submitDisabled = false,
}: FormActionBarProps) {
  const busy = isSaving || isSubmitting;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="min-h-5 text-muted-foreground text-xs">{statusHint}</p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={busy}
          onClick={onReset}
          size="sm"
          type="button"
          variant="ghost"
        >
          <RotateCcw data-icon="inline-start" />
          Reset
        </Button>
        {onSave ? (
          <Button
            disabled={busy || saveDisabled}
            onClick={onSave}
            size="sm"
            type="button"
            variant="outline"
          >
            {isSaving ? (
              <Spinner className="size-4" data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            {isSaving ? "Saving…" : "Save"}
          </Button>
        ) : null}
        <Button
          disabled={busy}
          onClick={onDownloadPdf}
          size="sm"
          type="button"
          variant="outline"
        >
          <Download data-icon="inline-start" />
          Download PDF
        </Button>
        {onSubmit ? (
          <Button
            disabled={busy || submitDisabled}
            onClick={onSubmit}
            size="sm"
            type="button"
          >
            {isSubmitting ? (
              <Spinner className="size-4" data-icon="inline-start" />
            ) : (
              <Send data-icon="inline-start" />
            )}
            {isSubmitting ? "Submitting…" : "Submit"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
