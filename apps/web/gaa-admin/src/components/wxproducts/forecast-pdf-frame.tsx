"use client";

import type { ProductContent } from "@barrelsgd/gms/products";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { previewProductPdfAction } from "@/app/(admin)/wxproducts/product-actions";

const DEBOUNCE_MS = 1000;

/**
 * Live preview of a product as FastAPI will issue it: the same renderer
 * produces this draft and the saved revision PDF, so there is no second layout.
 */
export function ForecastPdfFrame({
  actions,
  content,
  description,
  expectedRevision,
}: {
  actions: ReactNode;
  content: ProductContent;
  description: ReactNode;
  expectedRevision: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const current = useRef<string | null>(null);
  const [status, setStatus] = useState<"idle" | "rendering" | "error">(
    "rendering"
  );
  const key = JSON.stringify(content);

  // `key` captures every content change; the object itself is recreated per render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("rendering");
      const result = await previewProductPdfAction(
        {
          kind: content.kind,
          values: content.values,
          expectedRevision,
          changeSummary: "",
        },
        controller.signal
      );
      if (controller.signal.aborted) return;
      if (!result.ok) {
        if (!("aborted" in result)) setStatus("error");
        return;
      }
      const next = URL.createObjectURL(result.blob);
      if (current.current) URL.revokeObjectURL(current.current);
      current.current = next;
      setUrl(next);
      setStatus("idle");
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [key, expectedRevision]);

  useEffect(
    () => () => {
      if (current.current) URL.revokeObjectURL(current.current);
    },
    []
  );

  let state: ReactNode = null;
  if (status === "rendering")
    state = <span aria-live="polite">Updating preview…</span>;
  else if (status === "error")
    state = (
      <span role="alert">
        Preview unavailable. It retries after your next edit.
      </span>
    );

  return (
    <div className="flex flex-col rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
        <div className="min-w-0">
          <h2 className="font-medium text-lg">Document preview</h2>
          <div className="text-muted-foreground text-xs">
            {state}
            {state && description ? " · " : null}
            {description}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      <div className="rounded-b-xl bg-muted p-3">
        {url ? (
          <iframe
            className="aspect-[210/297] w-full rounded-sm bg-white shadow-sm"
            src={`${url}#toolbar=0&navpanes=0&view=FitH`}
            title="Forecast PDF preview"
          />
        ) : (
          <div className="grid aspect-[210/297] w-full place-items-center rounded-sm bg-white text-muted-foreground text-sm">
            {status === "error" ? "Preview unavailable" : "Rendering preview…"}
          </div>
        )}
      </div>
    </div>
  );
}
