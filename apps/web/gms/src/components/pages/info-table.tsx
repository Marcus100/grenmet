import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InfoTableProps {
  caption?: string;
  headers: readonly string[];
  /** Column indices to render in the monospace data role, e.g. raw METAR/TAF/SYNOP
   *  strings or other fixed-width codes. */
  monoColumns?: readonly number[];
  /** Cells are text or, for a figure, a `Measure` that follows the unit switch. */
  rows: readonly (readonly ReactNode[])[];
}

/** Bordered data table. Scrolls on its own so narrow screens never pan. */
export function InfoTable({
  caption,
  headers,
  monoColumns,
  rows,
}: InfoTableProps) {
  return (
    <div className="overflow-x-auto rounded-gm-card border border-gm-border">
      <table className="w-full border-collapse text-left">
        {caption && (
          <caption className="border-gm-border border-b bg-gm-surface px-4 py-2.5 text-gm-text-secondary text-label leading-label lg:px-5">
            {caption}
          </caption>
        )}
        <thead className="bg-gm-surface">
          <tr>
            {headers.map((header) => (
              <th
                className="whitespace-nowrap px-4 py-2.5 font-bold text-gm-heading text-label uppercase leading-label tracking-wider lg:px-5 lg:py-3"
                key={header}
                scope="col"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            // Rows are a fixed list rendered once, so position is a stable key.
            // biome-ignore lint/suspicious/noArrayIndexKey: static table rows
            <tr className="border-gm-border border-t" key={rowIndex}>
              {row.map((cell, columnIndex) => (
                <td
                  className={cn(
                    "px-4 py-2.5 text-body text-gm-text-secondary leading-body lg:px-5 lg:py-3",
                    monoColumns?.includes(columnIndex) &&
                      "font-mono tabular-nums"
                  )}
                  // biome-ignore lint/suspicious/noArrayIndexKey: static table cells
                  key={columnIndex}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
