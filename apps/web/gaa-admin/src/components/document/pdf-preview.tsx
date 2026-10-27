"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@barrelsgd/ui/components/ui/dialog";
import { Download, Eye, Maximize2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { reportError } from "@/lib/report-error";

/** A server-rendered PDF: how to fetch it, and what to call the download. */
export interface PdfSource {
  filename: string;
  render: (signal: AbortSignal) => Promise<Blob>;
}

const PDF_FRAME_PARAMS = "#toolbar=0&navpanes=0&view=FitH";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Full-size PDF viewer used by the expand button and by history rows. */
export function PdfDialog({
  description,
  onOpenChange,
  open,
  title,
  url,
}: {
  description?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
  url: string | null;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="h-[92svh] grid-rows-[auto_1fr] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? "Full-size view"}
          </DialogDescription>
        </DialogHeader>
        {url ? (
          <iframe
            className="h-full min-h-0 w-full rounded-sm bg-white"
            src={`${url}${PDF_FRAME_PARAMS}`}
            title={`${title} full size`}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface Shown {
  blob: Blob;
  key: string;
  url: string;
}

/**
 * The one PDF preview for every document desk, modelled on the forecast
 * preview: a Preview button renders the current entries on the server, one
 * frame shows the result, and "Changes pending" appears as soon as the entries
 * (`inputKey`) move on. Nothing renders while the user types. A failed refresh
 * keeps the previous PDF and offers Retry. `autoRender` renders once without a
 * click, for fixed documents such as a signed copy.
 */
export function PdfPreview({
  autoRender = false,
  description,
  emptyHint = "Enter the required fields to enable the preview.",
  errorArea = "pdf-preview",
  inputKey,
  pdf,
  ready = true,
  title,
}: {
  autoRender?: boolean;
  description?: string;
  emptyHint?: string;
  errorArea?: string;
  /** Changes whenever the previewable entries change; drives "Changes pending". */
  inputKey: string;
  pdf: PdfSource;
  /** False disables Preview until the entries are complete enough to render. */
  ready?: boolean;
  title: string;
}) {
  const panelId = useId();
  const [shown, setShown] = useState<Shown | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const latestPdf = useRef(pdf);
  latestPdf.current = pdf;

  const renderNow = useCallback(
    async (key: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const source = latestPdf.current;
      setRendering(true);
      setError("");
      try {
        const blob = await source.render(controller.signal);
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setShown({ blob, key, url });
      } catch (caught) {
        if (controller.signal.aborted) return;
        reportError(caught, errorArea);
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not render the preview. Check your connection and retry."
        );
      } finally {
        if (!controller.signal.aborted) setRendering(false);
      }
    },
    [errorArea]
  );

  // A fixed document (signed copy) re-renders when its identity (inputKey) changes.
  useEffect(() => {
    if (autoRender && ready) renderNow(inputKey);
  }, [autoRender, ready, inputKey, renderNow]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  const stale = shown !== null && shown.key !== inputKey;
  let status = "";
  if (rendering) status = "Rendering preview…";
  else if (stale) status = "Changes pending";
  else if (!(shown || ready)) status = emptyHint;

  return (
    <section aria-label={title} className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-medium text-lg">{title}</h2>
          {description ? (
            <p className="text-muted-foreground text-xs">{description}</p>
          ) : null}
          <p aria-live="polite" className="text-muted-foreground text-xs">
            {status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            aria-controls={panelId}
            disabled={!ready || rendering}
            onClick={() => renderNow(inputKey)}
            type="button"
            variant={stale || !shown ? "default" : "outline"}
          >
            <Eye data-icon="inline-start" />
            Preview
          </Button>
          <Button
            disabled={!shown}
            onClick={() => setExpanded(true)}
            type="button"
            variant="outline"
          >
            <Maximize2 data-icon="inline-start" />
            Expand
          </Button>
          <Button
            disabled={!shown}
            onClick={() => shown && downloadBlob(shown.blob, pdf.filename)}
            type="button"
            variant="outline"
          >
            <Download data-icon="inline-start" />
            Download PDF
          </Button>
        </div>
      </div>
      {error ? (
        <div className="space-y-2">
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
          <Button
            onClick={() => renderNow(inputKey)}
            type="button"
            variant="outline"
          >
            Retry PDF preview
          </Button>
        </div>
      ) : null}
      <div aria-busy={rendering} id={panelId}>
        {shown ? (
          <iframe
            className="aspect-[210/297] w-full rounded-sm border bg-white"
            src={`${shown.url}${PDF_FRAME_PARAMS}`}
            title={`${title} frame`}
          />
        ) : (
          <div className="grid aspect-[210/297] w-full place-items-center rounded-sm border bg-muted p-4 text-center text-muted-foreground text-sm">
            No preview yet
          </div>
        )}
      </div>
      <PdfDialog
        onOpenChange={setExpanded}
        open={expanded}
        title={title}
        url={shown?.url ?? null}
      />
    </section>
  );
}
