import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";
import type { ManagedEvent, Organiser } from "@/domain/types";
import { formatEventDate } from "@/lib/datetime";
import { DashShell } from "./dash-shell";

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

const RECENT_LIMIT = 5;

const STATUS_BADGE: Record<
  ManagedEvent["status"],
  { label: string; variant: "light-light" | "light-success" | "light-warning" }
> = {
  cancelled: { label: "Cancelled", variant: "light-light" },
  draft: { label: "Draft", variant: "light-warning" },
  published: { label: "Published", variant: "light-success" },
};

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-heading-base tabular-nums">
        {value}
      </p>
    </div>
  );
}

function UnavailablePanel({ title }: { title: string }) {
  return (
    <section className="rounded-2xl border border-border border-dashed bg-card p-4">
      <h2 className="font-semibold text-body-base">{title}</h2>
      <p className="mt-1 text-body text-muted-foreground">
        Available when ticketing launches. No figures are shown until then.
      </p>
    </section>
  );
}

/**
 * Organiser overview built from the real listings API. Sales and settlement
 * have no backing API yet, so they are empty states rather than figures.
 */
export function OrganiserOverview({
  listings,
  now,
  organiser,
}: {
  listings: readonly ManagedEvent[];
  now: Date;
  organiser: Organiser;
}) {
  const counts = countListings(listings, now);
  const recent = [...listings]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, RECENT_LIMIT);

  return (
    <DashShell active="overview" eventName={organiser.name} isDemo={false}>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display font-semibold text-heading-base">
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

        <section aria-labelledby="listings-heading" className="space-y-3">
          <h2 className="font-semibold text-body-base" id="listings-heading">
            Listings
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CountTile label="Total" value={counts.total} />
            <CountTile label="Published" value={counts.published} />
            <CountTile label="Upcoming" value={counts.upcoming} />
            <CountTile label="Drafts" value={counts.drafts} />
          </div>

          {recent.length === 0 ? (
            <p className="rounded-2xl border border-border border-dashed p-6 text-center text-body text-muted-foreground">
              No events yet. Create your first one.
            </p>
          ) : (
            <ul className="grid gap-2">
              {recent.map((event) => (
                <li
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
                  key={event.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-body">
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
          <UnavailablePanel title="Ticket sales" />
          <UnavailablePanel title="Settlement" />
        </div>
      </main>
    </DashShell>
  );
}
