"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { ButtonGroup } from "@grenmet/ui/components/ui/button-group";
import { Download, Printer } from "lucide-react";
import * as React from "react";

import {
  INVOICE_PAPER_HEIGHT,
  INVOICE_PAPER_SCALE,
  INVOICE_PAPER_WIDTH,
  type InvoiceFormValues,
} from "./data";
import { InvoicePaper } from "./invoice-paper";
import { PrintInvoice } from "./print-invoice";
import { useVisibleCenterPosition } from "./use-visible-center-position";

export function InvoicePreview({ invoice }: { invoice: InvoiceFormValues }) {
  const previewBodyRef = React.useRef<HTMLDivElement>(null);
  const paperLayout = useVisibleCenterPosition(previewBodyRef, {
    height: INVOICE_PAPER_HEIGHT,
    maxScale: INVOICE_PAPER_SCALE,
    width: INVOICE_PAPER_WIDTH,
  });

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <PrintInvoice invoice={invoice} />
      <div className="flex flex-col rounded-xl border bg-card">
        <div className="flex items-center justify-between px-4 py-4">
          <h2 className="font-medium text-lg">Preview</h2>
          <ButtonGroup>
            <Button onClick={handlePrint} type="button" variant="outline">
              <Printer data-icon="inline-start" />
              Print
            </Button>
            <Button type="button" variant="outline">
              <Download data-icon="inline-start" />
              Download PDF
            </Button>
          </ButtonGroup>
        </div>

        <div
          className="@container/preview relative min-h-[calc(100svh-15rem)] flex-1 rounded-b-xl bg-stone-200 p-4 dark:bg-stone-800"
          ref={previewBodyRef}
        >
          {paperLayout === null ? (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">
              Loading Preview
            </div>
          ) : null}
          <div
            className="absolute left-1/2 opacity-0 data-[ready=true]:opacity-100"
            data-ready={paperLayout !== null}
            style={{
              height: paperLayout
                ? INVOICE_PAPER_HEIGHT * paperLayout.scale
                : INVOICE_PAPER_HEIGHT * INVOICE_PAPER_SCALE,
              top: paperLayout?.top ?? "50%",
              transform:
                paperLayout === null
                  ? "translate(-50%, -50%)"
                  : "translateX(-50%)",
              width: paperLayout
                ? INVOICE_PAPER_WIDTH * paperLayout.scale
                : INVOICE_PAPER_WIDTH * INVOICE_PAPER_SCALE,
            }}
          >
            <div
              className="origin-top-left"
              style={{
                transform: `scale(${paperLayout?.scale ?? INVOICE_PAPER_SCALE})`,
              }}
            >
              <InvoicePaper invoice={invoice} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
