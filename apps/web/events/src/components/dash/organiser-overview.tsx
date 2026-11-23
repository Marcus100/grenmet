import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";
import { formatMoney, money } from "@/domain/money";
import type {
  ManagedEvent,
  Organiser,
  OrganiserOption,
  SettlementSummary,
} from "@/domain/types";
import type { ShellEvent } from "@/lib/dash-navigation";
import { formatEventDate } from "@/lib/datetime";
import { LISTING_STATUS_BADGE as STATUS_BADGE } from "@/lib/listing-status";
import { DashShell } from "./dash-shell";
import { OrganiserLogo } from "./organiser-logo";

export interface ListingCounts {
  drafts: number;
  published: number;
  total: number;
  upcoming: number;
}

/** Counts from the organiser's own listings; drafts and cancelled are not upcoming. */
export function countListings(
  listings: readonly ManagedEvent[],
  now: Date
): ListingCounts {
  let drafts = 0;
  let published = 0;
  let upcoming = 0;
  for (const event of listings) {
    if (event.status === "draft") {
      drafts += 1;
    }
    if (event.status === "published") {
      published += 1;
      if (new Date(event.endsAt) > now) {
        upcoming += 1;
      }
    }
  }
  return { drafts, published, total: listings.length, upcoming };
}

/**
 * The overview list: events that have not ended yet, soonest first, then the
 * ended ones, most recent first. Drafts and cancelled events sort by date too.
 */
export function overviewOrder(
  listings: readonly ManagedEvent[],
  now: Date
): ManagedEvent[] {
  const nowMs = now.getTime();
  const endsMs = (event: ManagedEvent) => Date.parse(event.endsAt);
  const startsMs = (event: ManagedEvent) => Date.parse(event.startsAt);
  const upcoming = listings
    .filter((event) => endsMs(event) > nowMs)
    .sort((a, b) => startsMs(a) - startsMs(b));
  const ended = listings
    .filter((event) => endsMs(event) <= nowMs)
    .sort((a, b) => startsMs(b) - startsMs(a));
  return [...upcoming, ...ended];
}

/**
 * Totals across the ticketed events' settlement summaries (no online revenue
 * here). `active` is the valid tickets (`claimed`): issued minus refunded and
 * minus holder-cancelled. The three statuses are exclusive, so nothing is
 * subtracted twice.
 */
export function salesTotals(rows: readonly SettlementSummary[]) {
  let issued = 0;
  let active = 0;
  let refunded = 0;
  let cancelledTickets = 0;
  let admitted = 0;
  let cashMinor = 0;
  for (const row of rows) {
    issued += row.issued;
    active += row.claimed;
    refunded += row.refunded;
    cancelledTickets += row.cancelled;
    admitted += row.admitted;
    cashMinor += row.cashCollectedMinor;
  }
  return {
    active,
    admitted,
    cancelledTickets,
    cashMinor,
    issued,
    refunded,
  };
}

/** The active and issued counts are always shown. Zero adjustments are omitted. */
export function issuedBreakdown(totals: {
  active: number;
  cancelledTickets: number;
  issued: number;
  refunded: number;
}): string {
  const parts = [`${totals.active} active`, `${totals.issued} issued`];
  if (totals.refunded > 0) {
    parts.push(`${totals.refunded} refunded`);
  }
  if (totals.cancelledTickets > 0) {
    parts.push(`${totals.cancelledTickets} cancelled`);
  }
  return parts.join(" · ");
}

const RECENT_LIMIT = 5;

function CountTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail?: string;
}) {
  return (
    <div className="border-border bg-card rounded-2xl border p-4">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="text-heading-base mt-1 font-semibold tabular-nums">
        {value}
      </p>
      {detail ? (
        <p className="text-caption text-muted-foreground mt-1 tabular-nums">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function SettlementPanel({ rows }: { rows: readonly SettlementSummary[] }) {
  return (
    <section className="border-border bg-card rounded-2xl border p-4">
      <h2 className="text-body-base font-semibold">Settlement</h2>
      {rows.length === 0 ? (
        <p className="text-body text-muted-foreground mt-1">
          No ticketed events to settle yet.
        </p>
      ) : (
        <table className="text-caption mt-2 w-full text-left">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Event</th>
              <th className="py-1 font-medium">Active</th>
              <th className="py-1 font-medium">Issued (all)</th>
              <th className="py-1 font-medium">Admitted</th>
              <th className="py-1 font-medium">Cash</th>
              <th className="py-1 font-medium">Issues</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.listingId}>
                <td className="py-1.5">
                  <Link
                    className="font-medium hover:underline"
                    href={`/dash/events/${row.listingId}/settlement`}
                  >
                    {row.title}
                  </Link>
                </td>
                <td className="py-1.5 tabular-nums">{row.claimed}</td>
                <td className="py-1.5 tabular-nums">{row.issued}</td>
                <td className="py-1.5 tabular-nums">{row.admitted}</td>
                <td className="py-1.5 tabular-nums">
                  {formatMoney(money(row.cashCollectedMinor, "XCD"))}
                </td>
                <td className="py-1.5 tabular-nums">
                  {row.issues > 0 ? (
                    <Badge variant="light-warning">{row.issues}</Badge>
                  ) : (
                    "0"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * Sales totals from the same settlement summaries as the panel below. Only
 * what settlement reports is shown: issued tickets, admissions and cash taken
 * at the till. Online payments are not totalled here.
 */
function SalesPanel({ rows }: { rows: readonly SettlementSummary[] }) {
  const totals = salesTotals(rows);
  return (
    <section
      aria-labelledby="sales-heading"
      className="border-border bg-card space-y-3 rounded-2xl border p-4"
    >
      <h2 className="text-body-base font-semibold" id="sales-heading">
        Ticket sales
      </h2>
      {rows.length === 0 ? (
        <p className="text-body text-muted-foreground">
          No ticketed events yet, so there are no sales to total.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <CountTile
              detail={issuedBreakdown(totals)}
              label="Tickets active"
              value={totals.active}
            />
            <CountTile label="Admitted" value={totals.admitted} />
            <CountTile
              label="Cash at the till"
              value={formatMoney(money(totals.cashMinor, "XCD"))}
            />
          </div>
          <p className="text-caption text-muted-foreground">
            Totals for {rows.length} ticketed{" "}
            {rows.length === 1 ? "event" : "events"}, from settlement. Online
            payments are not totalled here; each event&apos;s Settlement has the
            breakdown.
          </p>
        </>
      )}
    </section>
  );
}

/**
 * Organiser overview built from the real listings API. The settlement
 * summaries feed both the sales totals and the per-event settlement list.
 */
export function OrganiserOverview({
  event = null,
  listings,
  now,
  organiser,
  organisers = [],
  settlement = [],
  viewerName,
}: {
  /** The event the member last opened, shown in the nav's event selector. */
  event?: ShellEvent | null;
  listings: readonly ManagedEvent[];
  now: Date;
  organiser: Organiser;
  organisers?: readonly OrganiserOption[];
  settlement?: readonly SettlementSummary[];
  viewerName: string;
}) {
  const counts = countListings(listings, now);
  const recent = overviewOrder(listings, now).slice(0, RECENT_LIMIT);

  return (
    <DashShell
      active="overview"
      currentOrganiser={organiser.slug}
      event={event}
      eventName={organiser.name}
      organisers={organisers}
      viewerName={viewerName}
    >
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-heading-base font-semibold">
              Overview
            </h1>
            <p className="text-body text-muted-foreground">
              Listings for {organiser.name}.
            </p>
          </div>
          <Link
            className={cn(buttonVariants({ size: "lg" }))}
            href="/dash/events/new"
          >
            <Plus data-icon="inline-start" />
            New event
          </Link>
        </div>

        <OrganiserLogo
          initialFileId={organiser.logoFileId ?? null}
          organisationId={organiser.organisationId ?? null}
        />

        <section aria-labelledby="listings-heading" className="space-y-3">
          <h2 className="text-body-base font-semibold" id="listings-heading">
            Listings
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CountTile label="Total" value={counts.total} />
            <CountTile label="Published" value={counts.published} />
            <CountTile label="Upcoming" value={counts.upcoming} />
            <CountTile label="Drafts" value={counts.drafts} />
          </div>

          {recent.length === 0 ? (
            <p className="border-border text-body text-muted-foreground rounded-2xl border border-dashed p-6 text-center">
              No events yet. Create your first one.
            </p>
          ) : (
            <ul className="grid gap-2">
              {recent.map((event) => (
                <li
                  className="border-border bg-card flex flex-wrap items-center gap-3 rounded-xl border p-3"
                  key={event.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-body truncate font-semibold">
                      {event.title}
                    </p>
                    <p className="text-caption text-muted-foreground">
                      {formatEventDate(event.startsAt)}
                    </p>
                  </div>
                  <Badge variant={STATUS_BADGE[event.status].variant}>
                    {STATUS_BADGE[event.status].label}
                  </Badge>
                  <Link
                    className={cn(buttonVariants({ variant: "outline" }))}
                    href={`/dash/events/${event.id}`}
                  >
                    Edit
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {listings.length > RECENT_LIMIT ? (
            <Link
              className="text-caption text-muted-foreground hover:underline"
              href="/dash/events"
            >
              All {listings.length} events
            </Link>
          ) : null}
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <SalesPanel rows={settlement} />
          <SettlementPanel rows={settlement} />
        </div>
      </main>
    </DashShell>
  );
}
