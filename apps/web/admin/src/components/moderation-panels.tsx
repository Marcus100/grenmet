import type {
  VerificationCase,
  VerificationCaseEvent,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import Link from "next/link";
import {
  historyActionLabel,
  MODERATION_STATUSES,
  type ModerationStatus,
} from "@/lib/moderation-form";

export type CaseRow = VerificationCase;
export type CaseEvent = VerificationCaseEvent;

export function stamp(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

const STATUS_LABEL: Record<ModerationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_VARIANT = {
  pending: "light-warning",
  approved: "light-success",
  rejected: "light-error",
} as const;

const EMPTY_TEXT: Record<ModerationStatus, string> = {
  pending: "No organisers are waiting for review.",
  approved: "No organisers have been approved yet.",
  rejected: "No organisers have been rejected.",
};

export function StatusBadge({ status }: { status: ModerationStatus }) {
  const variant = STATUS_VARIANT[status];
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>;
}

export function StatusTabs({ current }: { current: ModerationStatus }) {
  return (
    <nav aria-label="Verification status" className="flex flex-wrap gap-2">
      {MODERATION_STATUSES.map((status) => (
        <Link
          aria-current={status === current ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-md border px-4 text-sm hover:bg-muted ${
            status === current ? "bg-muted font-medium" : ""
          }`}
          href={`/moderation?status=${status}`}
          key={status}
        >
          {STATUS_LABEL[status]}
        </Link>
      ))}
    </nav>
  );
}

export function CaseTable({
  rows,
  status,
}: {
  rows: CaseRow[];
  status: ModerationStatus;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground" role="status">
        {EMPTY_TEXT[status]}
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Organiser</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Decided</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.organisation_id}>
            <TableCell>
              <Link
                className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
                href={`/moderation/${encodeURIComponent(row.organisation_id)}`}
              >
                {row.name}
              </Link>
              <div className="font-mono text-muted-foreground text-xs">
                {row.organiser_slug}
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge status={row.verification_status} />
            </TableCell>
            <TableCell>{stamp(row.requested_at)}</TableCell>
            <TableCell>
              {row.decided_at ? stamp(row.decided_at) : "Not yet"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function HistoryTimeline({ events }: { events: CaseEvent[] }) {
  return (
    <section aria-labelledby="case-history-heading" className="space-y-2">
      <h2 className="font-medium" id="case-history-heading">
        History
      </h2>
      {events.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          No decisions have been recorded yet.
        </p>
      ) : (
        <ol className="space-y-2 text-sm">
          {events.map((event) => (
            <li
              className="rounded-md border p-3"
              key={`${event.at}-${event.action}`}
            >
              <div className="flex flex-wrap gap-x-3">
                <span className="font-medium">
                  {historyActionLabel(event.action)}
                </span>
                <span className="text-muted-foreground">
                  {event.actor_name}, {stamp(event.at)}
                </span>
              </div>
              {event.reason ? (
                <p className="mt-1 text-muted-foreground">{event.reason}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function DecisionNotice({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section
      aria-labelledby="decision-heading"
      className="space-y-2 rounded-md border border-dashed p-3 text-sm"
    >
      <h2 className="font-medium" id="decision-heading">
        {title}
      </h2>
      <div className="text-muted-foreground">{children}</div>
    </section>
  );
}
