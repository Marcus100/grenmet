"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { ButtonGroup } from "@grenmet/ui/components/ui/button-group";
import { Download, Printer } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { PAPER_HEIGHT, PAPER_SCALE, PAPER_WIDTH } from "./paper";
import { PrintDocument } from "./print-document";
import { usePaperScale } from "./use-paper-scale";

/**
 * Invoice-style document preview: a toolbar (Print / Download PDF) above a paper
 * that floats, auto-scaled and centered, on a neutral backdrop. `children` is the
 * `<Paper>`-wrapped document; it is rendered both here (scaled) and in the hidden
 * print portal.
 */
export function DocumentPreview({
  title = "Preview",
  onDownloadPdf,
  children,
  showDownloadPdf = true,
}: {
  title?: string;
  onDownloadPdf?: () => void;
  children: ReactNode;
  /** Hide the Download-PDF button when a surrounding action bar already offers it. */
  showDownloadPdf?: boolean;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const layout = usePaperScale(bodyRef, {
    height: PAPER_HEIGHT,
    maxScale: PAPER_SCALE,
    width: PAPER_WIDTH,
  });
  const scale = layout?.scale ?? PAPER_SCALE;
  const handleDownload = onDownloadPdf ?? (() => window.print());

  return (
    <>
      <PrintDocument>{children}</PrintDocument>
      <div className="flex flex-col rounded-xl border bg-card">
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="font-medium text-lg">{title}</h2>
          <ButtonGroup>
            <Button
              onClick={() => window.print()}
              type="button"
              variant="outline"
            >
              <Printer data-icon="inline-start" />
              Print
            </Button>
            {showDownloadPdf ? (
              <Button onClick={handleDownload} type="button" variant="outline">
                <Download data-icon="inline-start" />
                Download PDF
              </Button>
            ) : null}
          </ButtonGroup>
        </div>

        <div
          className="relative min-h-[calc(100svh-15rem)] flex-1 rounded-b-xl bg-stone-200 p-4 dark:bg-stone-800"
          ref={bodyRef}
        >
          {layout === null ? (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">
              Loading preview
            </div>
          ) : null}
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
              {children}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
