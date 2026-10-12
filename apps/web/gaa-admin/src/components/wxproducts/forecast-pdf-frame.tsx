"use client";

import type { ProductContent } from "@barrelsgd/gms/products";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useEffect, useId, useRef, useState } from "react";
import { previewProductPdfAction } from "@/app/(admin)/wxproducts/product-actions";
import { reportError } from "@/lib/report-error";

export interface PdfPreviewRequest {
  content: ProductContent;
  expectedRevision: number;
  requestId: number;
}

/** Render only explicit snapshots, retaining the last PDF while editing or retrying. */
export function ForecastPdfFrame({
  content,
  expanded,
  onExpandedChange,
  onRetry,
  request,
}: {
  content: ProductContent;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onRetry: () => void;
  request: PdfPreviewRequest | null;
}) {
  const panelId = useId();
  const [displayed, setDisplayed] = useState<{
    url: string;
    content: ProductContent;
  } | null>(null);
  const current = useRef<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    async function renderPdf() {
      if (!request) return;
      setRendering(true);
      setError("");
      try {
        const result = await previewProductPdfAction(
          {
            kind: request.content.kind,
            values: request.content.values,
            expectedRevision: request.expectedRevision,
            changeSummary: "",
          },
          controller.signal
        );
        if (controller.signal.aborted) return;
        if (!result.ok) {
          if (!("aborted" in result)) setError(result.error);
          return;
        }
        const next = URL.createObjectURL(result.blob);
        if (current.current) URL.revokeObjectURL(current.current);
        current.current = next;
        setDisplayed({ url: next, content: request.content });
      } catch (caught) {
        if (!controller.signal.aborted) {
          reportError(caught, "wxproducts-pdf-preview");
          setError(
            "Could not render the preview. Check your connection and retry."
          );
        }
      } finally {
        if (!controller.signal.aborted) setRendering(false);
      }
    }
    renderPdf();
    return () => controller.abort();
  }, [request]);

  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current);
    },
    []
  );

  const stale =
    displayed !== null &&
    JSON.stringify(displayed.content) !== JSON.stringify(content);

  return (
    <section aria-label="Full PDF preview" className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          aria-controls={panelId}
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
          type="button"
          variant="outline"
        >
          {expanded ? "Hide full PDF" : "Show full PDF"}
        </Button>
        <p aria-live="polite" className="text-muted-foreground text-xs">
          {rendering ? "Updating preview…" : null}
          {rendering && stale ? " · " : null}
          {stale ? "Changes pending" : null}
        </p>
      </div>
      {error ? (
        <div className="space-y-2">
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
          <Button onClick={onRetry} type="button" variant="outline">
            Retry PDF preview
          </Button>
        </div>
      ) : null}
      <div hidden={!expanded} id={panelId}>
        {displayed ? (
          <iframe
            className="aspect-[210/297] w-full rounded-sm border"
            src={`${displayed.url}#toolbar=0&navpanes=0&view=FitH`}
            title="Forecast PDF preview"
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            {rendering
              ? "Rendering preview…"
              : "Save draft, validate, or select Preview PDF to render the full document."}
          </p>
        )}
      </div>
    </section>
  );
}
