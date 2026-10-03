"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Printer } from "lucide-react";
import { Paper } from "@/components/document/paper";
import { PrintDocument } from "@/components/document/print-document";
import type { QrMatrix } from "@/lib/janitorial/qr";

export interface AreaLabel {
  buildingName: string;
  code: string;
  id: number;
  name: string;
  qr: QrMatrix;
}

/** Labels per US Letter page: 3 columns × 4 rows of 2.5in squares. */
export const LABELS_PER_PAGE = 12;
const QUIET_ZONE = 2;

export function QrSymbol({
  className,
  qr,
  title,
}: {
  className?: string;
  qr: QrMatrix;
  title: string;
}) {
  const extent = qr.size + QUIET_ZONE * 2;
  return (
    <svg
      className={className}
      role="img"
      shapeRendering="crispEdges"
      viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${extent} ${extent}`}
    >
      <title>{title}</title>
      <rect
        fill="white"
        height={extent}
        width={extent}
        x={-QUIET_ZONE}
        y={-QUIET_ZONE}
      />
      <path d={qr.path} fill="black" />
    </svg>
  );
}

function Label({ label }: { label: AreaLabel }) {
  return (
    <div className="flex flex-col items-center justify-between border border-zinc-300 border-dashed p-3 text-center">
      <div className="w-full">
        <p className="truncate text-[11px] text-zinc-600">
          {label.buildingName}
        </p>
        <p className="line-clamp-2 font-semibold text-sm leading-tight">
          {label.name}
        </p>
      </div>
      <QrSymbol
        className="size-32"
        qr={label.qr}
        title={`QR code for ${label.code}`}
      />
      <p className="font-mono text-xs tracking-wide">{label.code}</p>
    </div>
  );
}

function Pages({ labels }: { labels: AreaLabel[] }) {
  const pages: AreaLabel[][] = [];
  for (let start = 0; start < labels.length; start += LABELS_PER_PAGE) {
    pages.push(labels.slice(start, start + LABELS_PER_PAGE));
  }
  return pages.map((page) => (
    <Paper className="p-12" key={page[0]?.id}>
      <div className="grid h-full grid-cols-3 grid-rows-4">
        {page.map((label) => (
          <Label key={label.id} label={label} />
        ))}
      </div>
    </Paper>
  ));
}

export function QrLabelSheet({ labels }: { labels: AreaLabel[] }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {labels.length} labels on {Math.ceil(labels.length / LABELS_PER_PAGE)}{" "}
          Letter pages. Stick each label where cleaners enter the area.
        </p>
        <Button
          disabled={labels.length === 0}
          onClick={() => window.print()}
          type="button"
        >
          <Printer data-icon="inline-start" />
          Print labels
        </Button>
      </div>
      <div className="space-y-6 overflow-x-auto rounded-xl border bg-muted p-6">
        <Pages labels={labels} />
      </div>
      <PrintDocument>
        <Pages labels={labels} />
      </PrintDocument>
    </div>
  );
}
