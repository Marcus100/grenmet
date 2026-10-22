import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import type { ReactNode } from "react";

export interface MemberRow {
  email: string;
  full_name: string;
  membership_id: string;
  role: string;
}

export interface HistoryRow {
  action: string;
  actor_name: string;
  changes: { field: string; masked?: boolean; new?: unknown; old?: unknown }[];
  created_at: string;
  id: string;
  record_label: string;
}

function formatStamp(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}

function show(value: unknown): string {
  return value === null || value === undefined ? "none" : String(value);
}

export function MembersPanel({
  addForm,
  count,
  rowActions,
  rows,
}: {
  /** Slot for the superuser "Add member" form; shown even when the roster is empty. */
  addForm?: ReactNode;
  count: number;
  /** Optional per-row controls (change role, remove). */
  rowActions?: (row: MemberRow) => ReactNode;
  rows: MemberRow[];
}) {
  return (
    <section aria-labelledby="members-heading" className="space-y-2">
      <h2 className="font-medium" id="members-heading">
        Members ({count})
      </h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          No active members.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              {rowActions ? <TableHead>Manage</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.membership_id}>
                <TableCell>{row.full_name}</TableCell>
                <TableCell>{row.email}</TableCell>
                <TableCell className="capitalize">{row.role}</TableCell>
                {rowActions ? <TableCell>{rowActions(row)}</TableCell> : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {count > rows.length ? (
        <p className="text-muted-foreground text-xs">
          Showing the first {rows.length} members.
        </p>
      ) : null}
      {addForm}
    </section>
  );
}

export function HistoryPanel({
  count,
  rows,
}: {
  count: number;
  rows: HistoryRow[];
}) {
  return (
    <section aria-labelledby="history-heading" className="space-y-2">
      <h2 className="font-medium" id="history-heading">
        History
      </h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          No changes recorded yet.
        </p>
      ) : (
        <ol className="space-y-2 text-sm">
          {rows.map((row) => (
            <li className="rounded-md border p-3" key={row.id}>
              <div className="flex flex-wrap gap-x-3">
                <span className="font-medium">
                  {row.record_label}: {row.action}
                </span>
                <span className="text-muted-foreground">
                  {row.actor_name}, {formatStamp(row.created_at)} UTC
                </span>
              </div>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {row.changes.map((change) => (
                  <li key={change.field}>
                    <span className="font-mono">{change.field}</span>
                    {change.masked
                      ? ": hidden"
                      : `: ${show(change.old)} -> ${show(change.new)}`}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {count > rows.length ? (
        <p className="text-muted-foreground text-xs">
          Showing the latest {rows.length} of {count} entries.
        </p>
      ) : null}
    </section>
  );
}
