"use client";

import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { ButtonGroup } from "@barrelsgd/ui/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@barrelsgd/ui/components/ui/dialog";
import { Download, Eye, Maximize2, Printer } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { reportError } from "@/lib/report-error";
import { PAPER_HEIGHT, PAPER_SCALE, PAPER_WIDTH } from "./paper";
import { PrintDocument } from "./print-document";
import { usePaperScale } from "./use-paper-scale";

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

function previewStatus({
  emptyHint,
  error,
  hasRender,
  ready,
  rendering,
  stale,
}: {
  emptyHint: string;
  error: string | null;
  hasRender: boolean;
  ready: boolean;
  rendering: boolean;
  stale: boolean;
}): ReactNode {
  if (error) return <span role="alert">{error}</span>;
  if (rendering) return "Rendering preview…";
  if (stale) return "Your entries changed. Select Preview to refresh.";
  if (hasRender) return "Preview matches your entries.";
  return ready ? "Select Preview to render the document." : emptyHint;
}

function OutputButtons({
  blob,
  filename,
  onDownloadPdf,
  showDownloadPdf,
}: {
  blob: Blob | null;
  filename?: string;
  onDownloadPdf?: () => void;
  showDownloadPdf: boolean;
}) {
  if (filename) {
    return (
      <Button
        disabled={!blob}
        onClick={() => blob && downloadBlob(blob, filename)}
        type="button"
        variant="outline"
      >
        <Download data-icon="inline-start" />
        Download PDF
      </Button>
    );
  }
  return (
    <>
      <Button onClick={() => window.print()} type="button" variant="outline">
        <Printer data-icon="inline-start" />
        Print
      </Button>
      {showDownloadPdf ? (
        <Button
          onClick={onDownloadPdf ?? (() => window.print())}
          type="button"
          variant="outline"
        >
          <Download data-icon="inline-start" />
          Download PDF
        </Button>
      ) : null}
    </>
  );
}

function PdfBody({
  error,
  title,
  url,
}: {
  error: string | null;
  title: string;
  url: string | null;
}) {
  return (
    <div className="rounded-b-xl bg-muted p-3">
      {url ? (
        <iframe
          className="aspect-[210/297] w-full rounded-sm bg-white shadow-sm"
          src={`${url}${PDF_FRAME_PARAMS}`}
          title={`${title} frame`}
        />
      ) : (
        <div className="grid aspect-[210/297] w-full place-items-center rounded-sm bg-white p-4 text-center text-muted-foreground text-sm">
          {error ? "Preview unavailable" : "No preview yet"}
        </div>
      )}
    </div>
  );
}

/** The scaled, centred paper that shows a client-rendered snapshot. */
function PaperBody({ node }: { node: ReactNode }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const layout = usePaperScale(bodyRef, {
    height: PAPER_HEIGHT,
    maxScale: PAPER_SCALE,
    width: PAPER_WIDTH,
  });
  const scale = layout?.scale ?? PAPER_SCALE;
  return (
    <div
      className="relative min-h-[calc(100svh-15rem)] flex-1 rounded-b-xl bg-stone-200 p-4 dark:bg-stone-800"
      ref={bodyRef}
    >
      {node === undefined ? (
        <div className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">
          No preview yet
        </div>
      ) : (
        <div
          className="absolute left-1/2 opacity-0 data-[ready=true]:opacity-100"
          data-ready={layout !== null}
          style={{
            height: PAPER_HEIGHT * scale,
            top: layout?.top ?? "50%",
            transform:
              layout === null ? "translate(-50%, -50%)" : "translateX(-50%)",
            width: PAPER_WIDTH * scale,
          }}
        >
          <div
            className="origin-top-left"
            style={{ transform: `scale(${scale})` }}
          >
            {node}
          </div>
        </div>
      )}
    </div>
  );
}

function PaperDialog({
  node,
  onOpenChange,
  open,
  title,
}: {
  node: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="h-[92svh] grid-rows-[auto_1fr] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Full-size view</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-auto rounded-sm bg-stone-200 p-4 dark:bg-stone-800">
          <div className="mx-auto" style={{ width: PAPER_WIDTH }}>
            {node}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Shown {
  blob: Blob | null;
  key: string;
  node: ReactNode;
  url: string | null;
}

/**
 * The one preview panel for every document desk (HR forms, timesheet).
 *
 * Nothing renders while the user types. The Preview button renders a snapshot
 * of the current inputs, and the panel then says "Preview out of date" as soon
 * as the inputs (`inputKey`) change. Two bodies share the same toolbar:
 *
 * - `pdf`: a server-rendered PDF shown in a frame, with Expand and Download of
 *   the rendered file.
 * - `children`: a client-rendered paper document (no server renderer exists),
 *   with Expand, Print and Download PDF (print).
 *
 * `autoRender` renders once without a click, for fixed documents such as a
 * signed copy where there is no draft to go stale.
 */
export function DocumentPreview({
  title = "Preview",
  inputKey = "",
  ready = true,
  emptyHint = "Enter the required fields to enable the preview.",
  pdf,
  autoRender = false,
  onDownloadPdf,
  children,
  showDownloadPdf = true,
  printContent,
  actions,
  description,
  errorArea = "document-preview",
}: {
  title?: string;
  /** Changes whenever the previewable inputs change; drives the stale state. */
  inputKey?: string;
  /** False disables Preview until the inputs are complete enough to render. */
  ready?: boolean;
  emptyHint?: string;
  pdf?: PdfSource;
  autoRender?: boolean;
  /** Extra toolbar buttons, rendered after the standard ones. */
  actions?: ReactNode;
  /** Short note under the status line (hints). */
  description?: ReactNode;
  printContent?: ReactNode;
  onDownloadPdf?: () => void;
  /** Client-rendered document body, used when no `pdf` source is given. */
  children?: ReactNode;
  /** Hide the Download-PDF button when a surrounding action bar already offers it. */
  showDownloadPdf?: boolean;
  errorArea?: string;
}) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const latestChildren = useRef(children);
  latestChildren.current = children;
  const latestPdf = useRef(pdf);
  latestPdf.current = pdf;
  const latestKey = useRef(inputKey);
  latestKey.current = inputKey;

  const renderNow = useCallback(async () => {
    abortRef.current?.abort();
    const source = latestPdf.current;
    const key = latestKey.current;
    if (!source) {
      setError(null);
      setShown({ blob: null, key, node: latestChildren.current, url: null });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setRendering(true);
    setError(null);
    try {
      const blob = await source.render(controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setShown({ blob, key, node: null, url });
    } catch (caught) {
      if (controller.signal.aborted) return;
      reportError(caught, errorArea);
      // Keep the previous render so a failed refresh does not blank the page.
      setError(
        caught instanceof Error ? caught.message : "Preview unavailable"
      );
    } finally {
      if (!controller.signal.aborted) setRendering(false);
    }
  }, [errorArea]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a fixed document (signed copy) re-renders when its identity (inputKey) changes
  useEffect(() => {
    if (autoRender && ready) renderNow();
  }, [autoRender, ready, inputKey, renderNow]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  const stale = shown !== null && shown.key !== inputKey;
  const hasRender = shown !== null && (pdf ? shown.url !== null : true);
  const statusText = previewStatus({
    emptyHint,
    error,
    hasRender,
    ready,
    rendering,
    stale,
  });

  return (
    <>
      {pdf ? null : <PrintDocument>{printContent ?? children}</PrintDocument>}
      <div className="flex flex-col rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
          <div className="min-w-0">
            <h2 className="font-medium text-lg">{title}</h2>
            <p aria-live="polite" className="text-muted-foreground text-xs">
              {statusText}
            </p>
            {description ? (
              <div className="text-muted-foreground text-xs">{description}</div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {stale ? (
              <Badge variant="outline">Preview out of date</Badge>
            ) : null}
            <ButtonGroup>
              <Button
                disabled={!ready || rendering}
                onClick={renderNow}
                type="button"
                variant={stale || !hasRender ? "default" : "outline"}
              >
                <Eye data-icon="inline-start" />
                Preview
              </Button>
              <Button
                disabled={!hasRender}
                onClick={() => setExpanded(true)}
                type="button"
                variant="outline"
              >
                <Maximize2 data-icon="inline-start" />
                Expand
              </Button>
              <OutputButtons
                blob={shown?.blob ?? null}
                filename={pdf?.filename}
                onDownloadPdf={onDownloadPdf}
                showDownloadPdf={showDownloadPdf}
              />
              {actions}
            </ButtonGroup>
          </div>
        </div>

        {pdf ? (
          <PdfBody error={error} title={title} url={shown?.url ?? null} />
        ) : (
          <PaperBody node={shown ? shown.node : undefined} />
        )}
      </div>

      {pdf ? (
        <PdfDialog
          onOpenChange={setExpanded}
          open={expanded}
          title={title}
          url={shown?.url ?? null}
        />
      ) : (
        <PaperDialog
          node={shown?.node}
          onOpenChange={setExpanded}
          open={expanded}
          title={title}
        />
      )}
    </>
  );
}
