import { flexRender, type RowData } from "@tanstack/react-table";
import type { LegacyReactTable } from "@tanstack/react-table/legacy";
import type { ReactNode } from "react";

const OMITTED_COLUMNS = new Set(["select"]);

/**
 * The phone layout for a data table: each row becomes a card with the column
 * name above each value, so nothing is cut off or squeezed into a narrow
 * column. Shown only below md; the table stays for wider screens. An empty
 * table shows `empty` (an explanation), never bare "No results.".
 */
export function RowCards<TData extends RowData>({
  empty,
  table,
}: {
  empty: ReactNode;
  table: LegacyReactTable<TData>;
}) {
  const rows = table.getRowModel().rows;
  if (rows.length === 0) {
    return <div className="md:hidden">{empty}</div>;
  }
  return (
    <ul aria-label="Results" className="grid gap-3 md:hidden">
      {rows.map((row) => (
        <li className="bg-card rounded-xl border p-4" key={row.id}>
          <div className="grid gap-3 text-sm">
            {row.getVisibleCells().map((cell) => {
              // Bulk-select checkboxes stay in the table only: a second copy in
              // the cards would repeat their labels and ids. Actions stay, since
              // a phone needs them.
              if (OMITTED_COLUMNS.has(cell.column.id)) return null;
              // Only plain-text headers become labels; checkbox and icon
              // headers are not words, so their cells show without one.
              const { header } = cell.column.columnDef;
              const label = typeof header === "string" ? header : undefined;
              return (
                <div className="grid min-w-0 gap-0.5" key={cell.id}>
                  {label ? (
                    <span className="text-muted-foreground text-xs">
                      {label}
                    </span>
                  ) : null}
                  <div className="min-w-0 break-words">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                </div>
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}
