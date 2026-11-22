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

/** Label for a cell whose column has no header text, so no card label is empty. */
const UNLABELLED_COLUMN = "Value";

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

/**
 * Bordered data table. From `sm` up it is a real table in a scroll region that
 * can take keyboard focus, so a wide table scrolls sideways without panning the
 * page. On a phone each row becomes a card of label and value pairs, because a
 * clipped table hides its later columns. Only one rendering is displayed at a
 * time, so a cell's content is announced once.
 */
export function InfoTable({
  caption,
  headers,
  monoColumns,
  rows,
}: InfoTableProps) {
  const keys = rowKeys(rows);
  return (
    <section
      aria-label={caption ? `Table: ${caption}` : "Table"}
      className="rounded-gm-card border-gm-border overflow-hidden border"
    >
      {caption && (
        <p className="border-gm-border bg-gm-surface text-gm-text-secondary text-label leading-label border-b px-4 py-2.5 sm:hidden">
          {caption}
        </p>
      )}
      <ul className="divide-gm-border divide-y sm:hidden">
        {rows.map((row, rowIndex) => (
          <li className="px-4 py-3" key={keys[rowIndex]}>
            <dl className="grid gap-2">
              {row.map((cell, columnIndex) => (
                <div
                  className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3"
                  // biome-ignore lint/suspicious/noArrayIndexKey: columns are fixed for a table and never reorder; header text can repeat or be empty, so the position is the key
                  key={`column-${columnIndex}`}
                >
                  <dt className="text-gm-heading text-label leading-label font-bold tracking-wider uppercase">
                    {headers[columnIndex]?.trim() || UNLABELLED_COLUMN}
                  </dt>
                  <dd
                    className={cn(
                      "text-body text-gm-text-secondary leading-body",
                      monoColumns?.includes(columnIndex) &&
                        "font-mono tabular-nums"
                    )}
                  >
                    {cell}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <div
        className="focus-visible:shadow-gm-focus hidden overflow-x-auto focus-visible:outline-none sm:block"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the scroll region must be reachable by keyboard (WCAG 2.1.1); it exists only from sm up, where the table can scroll
        tabIndex={0}
      >
        <table className="w-full border-collapse text-left">
          {caption && (
            <caption className="border-gm-border bg-gm-surface text-gm-text-secondary text-label leading-label border-b px-4 py-2.5 lg:px-5">
              {caption}
            </caption>
          )}
          <thead className="bg-gm-surface">
            <tr>
              {headers.map((header, columnIndex) => (
                <th
                  className="text-gm-heading text-label leading-label px-4 py-2.5 font-bold tracking-wider whitespace-nowrap uppercase lg:px-5 lg:py-3"
                  // biome-ignore lint/suspicious/noArrayIndexKey: columns are fixed for a table and never reorder; header text can repeat or be empty, so the position is the key
                  key={`column-${columnIndex}`}
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
                    // biome-ignore lint/suspicious/noArrayIndexKey: columns are fixed for a table and never reorder; the position is the key
                    key={`column-${columnIndex}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
