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

/** A key for each row from its first text cell, numbered when two rows share one. */
function rowKeys(rows: InfoTableProps["rows"]): string[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = typeof row[0] === "string" ? row[0] : "row";
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return `${base}-${count}`;
  });
}

/** Bordered data table. Scrolls on its own so narrow screens never pan. */
export function InfoTable({
  caption,
  headers,
  monoColumns,
  rows,
}: InfoTableProps) {
  const keys = rowKeys(rows);
  return (
    <div className="rounded-gm-card border-gm-border overflow-x-auto border">
      <table className="w-full border-collapse text-left">
        {caption && (
          <caption className="border-gm-border bg-gm-surface text-gm-text-secondary text-label leading-label border-b px-4 py-2.5 lg:px-5">
            {caption}
          </caption>
        )}
        <thead className="bg-gm-surface">
          <tr>
            {headers.map((header) => (
              <th
                className="text-gm-heading text-label leading-label px-4 py-2.5 font-bold tracking-wider whitespace-nowrap uppercase lg:px-5 lg:py-3"
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
            <tr className="border-gm-border border-t" key={keys[rowIndex]}>
              {row.map((cell, columnIndex) => (
                <td
                  className={cn(
                    "text-body text-gm-text-secondary leading-body px-4 py-2.5 lg:px-5 lg:py-3",
                    monoColumns?.includes(columnIndex) &&
                      "font-mono tabular-nums"
                  )}
                  key={headers[columnIndex] ?? "extra"}
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
