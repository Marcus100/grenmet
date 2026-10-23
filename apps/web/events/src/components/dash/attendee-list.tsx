import type { OrgAttendee } from "@barrelsgd/api-client";
import Link from "next/link";
import { formatEventDate } from "@/lib/datetime";
import { TICKET_STATUSES, ticketStatus } from "@/lib/org-orders";
import { FilterLinks, Pager } from "./list-controls";
import { StatusBadge } from "./status-badge";

/** Ticket holders for one event, filtered by tier and ticket status. */
export function AttendeeList({
  count,
  listingId,
  page,
  rows,
  status,
  tierId,
  tiers,
  totalPages,
}: {
  count: number;
  listingId: string;
  page: number;
  rows: readonly OrgAttendee[];
  status: OrgAttendee["status"] | undefined;
  tierId: string | undefined;
  tiers: readonly { id: string; name: string }[];
  totalPages: number;
}) {
  const basePath = `/dash/events/${listingId}/attendees`;
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <FilterLinks
          basePath={basePath}
          current={tierId}
          label="Filter attendees by ticket type"
          options={[
            { label: "All ticket types", value: undefined },
            ...tiers.map((tier) => ({ label: tier.name, value: tier.id })),
          ]}
          param="tier"
          params={{ status }}
        />
        <FilterLinks
          basePath={basePath}
          current={status}
          label="Filter attendees by ticket status"
          options={[
            { label: "Any status", value: undefined },
            ...TICKET_STATUSES.map((value) => ({
              label: ticketStatus(value).label,
              value,
            })),
          ]}
          param="status"
          params={{ tier: tierId }}
        />
      </div>
      {rows.length === 0 ? (
        <p
          className="rounded-2xl border border-dashed bg-card px-4 py-8 text-center text-body text-muted-foreground"
          role="status"
        >
          {status || tierId
            ? "No attendees match these filters."
            : "No attendees yet. Ticket holders appear here once tickets are issued."}
        </p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {rows.map((attendee) => (
            <li
              className="grid min-h-11 gap-1 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
              key={attendee.ticket_id}
            >
              <span>
                <span className="block font-medium text-body">
                  {attendee.holder_name ?? "Holder without a name"}
                </span>
                <span className="block text-caption text-muted-foreground">
                  {attendee.tier_name} ·{" "}
                  <span className="font-mono tracking-wider">
                    {attendee.code}
                  </span>{" "}
                  ·{" "}
                  {attendee.admitted_at
                    ? `Admitted ${formatEventDate(attendee.admitted_at)}`
                    : "Not admitted yet"}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2 sm:justify-end">
                <StatusBadge status={ticketStatus(attendee.status)} />
                <Link
                  className="inline-flex min-h-11 items-center text-caption underline"
                  href={`/dash/events/${listingId}/orders/${attendee.order_id}`}
                >
                  View order
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Pager
        basePath={basePath}
        count={count}
        page={page}
        params={{ status, tier: tierId }}
        totalPages={totalPages}
      />
    </div>
  );
}
