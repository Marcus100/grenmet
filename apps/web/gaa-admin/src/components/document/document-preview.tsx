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
import { PAPER_HEIGHT, PAPER_SCALE, PAPER_WIDTH } from "./paper";
import { PrintDocument } from "./print-document";
import { usePaperScale } from "./use-paper-scale";

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
        <div className="text-muted-foreground absolute inset-0 grid place-items-center text-sm">
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
  key: string;
  node: ReactNode;
}

/**
 * The client-rendered paper preview, used only where no server renderer exists
 * yet (the timesheet). Every PDF-backed desk uses `PdfPreview` instead.
 *
 * Nothing renders while the user types. Preview renders a snapshot of the
 * current inputs, and the panel then says "Preview out of date" as soon as the
 * inputs (`inputKey`) change. `autoRender` renders once without a click.
 */
export function DocumentPreview({
  title = "Preview",
  inputKey = "",
  ready = true,
  emptyHint = "Enter the required fields to enable the preview.",
  autoRender = false,
  onDownloadPdf,
  children,
  showDownloadPdf = true,
  printContent,
  actions,
  description,
}: {
  title?: string;
  /** Changes whenever the previewable inputs change; drives the stale state. */
  inputKey?: string;
  /** False disables Preview until the inputs are complete enough to render. */
  ready?: boolean;
  emptyHint?: string;
  autoRender?: boolean;
  /** Extra toolbar buttons, rendered after the standard ones. */
  actions?: ReactNode;
  /** Short note under the status line (hints). */
  description?: ReactNode;
  printContent?: ReactNode;
  onDownloadPdf?: () => void;
  children?: ReactNode;
  /** Hide the Download-PDF button when a surrounding action bar already offers it. */
  showDownloadPdf?: boolean;
}) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [expanded, setExpanded] = useState(false);
  const latestChildren = useRef(children);
  latestChildren.current = children;
  const latestKey = useRef(inputKey);
  latestKey.current = inputKey;

  const renderNow = useCallback(() => {
    setShown({ key: latestKey.current, node: latestChildren.current });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a fixed document re-renders when its identity (inputKey) changes
  useEffect(() => {
    if (autoRender && ready) renderNow();
  }, [autoRender, ready, inputKey, renderNow]);

  const stale = shown !== null && shown.key !== inputKey;
  let status = emptyHint;
  if (stale) status = "Your entries changed. Select Preview to refresh.";
  else if (shown) status = "Preview matches your entries.";
  else if (ready) status = "Select Preview to render the document.";

  return (
    <>
      <PrintDocument>{printContent ?? children}</PrintDocument>
      <div className="bg-card flex flex-col rounded-xl border">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-medium">{title}</h2>
            <p aria-live="polite" className="text-muted-foreground text-xs">
              {status}
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
                disabled={!ready}
                onClick={renderNow}
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
                onClick={() => window.print()}
                type="button"
                variant="outline"
              >
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
              {actions}
            </ButtonGroup>
          </div>
        </div>
        <PaperBody node={shown ? shown.node : undefined} />
      </div>
      <PaperDialog
        node={shown?.node}
        onOpenChange={setExpanded}
        open={expanded}
        title={title}
      />
    </>
  );
}
