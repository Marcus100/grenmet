import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { ExternalLink, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DashShell } from "@/components/dash/dash-shell";
import { NoOrganiserAccess } from "@/components/dash/no-organiser-access";
import { EventFlyer } from "@/components/discovery/event-flyer";
import { getManagedOrganiser } from "@/data/events-api";
import { requireViewer } from "@/data/viewer";
import { PARISH_LABELS, priceLabel } from "@/domain/labels";
import type { ManagedEvent } from "@/domain/types";
import { formatEventDate } from "@/lib/datetime";

/** Organiser data is per-user and live; never prerender it. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "My events" };

function statusBadge(event: ManagedEvent, now: Date) {
  if (event.status === "draft") {
    return { label: "Draft", variant: "light-warning" as const };
  }
  if (event.status === "cancelled") {
    return { label: "Cancelled", variant: "light-light" as const };
  }
  return new Date(event.endsAt) <= now
    ? { label: "Ended", variant: "light-light" as const }
    : { label: "Published", variant: "light-success" as const };
}

export default async function DashEventsPage() {
  await requireViewer("/dash/events");
  const managed = await getManagedOrganiser();
  if (!managed) {
    return <NoOrganiserAccess />;
  }
  const { listings, organiser } = managed;
  const now = new Date();

  return (
    <DashShell active="events" eventName={organiser.name} isDemo={false}>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display font-semibold text-heading-base">
              My events
            </h1>
            <p className="text-body text-muted-foreground">
              Listings for {organiser.name}. Edit details, tiers and how each
              event looks on the public site.
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
        {listings.length === 0 ? (
          <p className="rounded-2xl border border-border border-dashed p-6 text-center text-body text-muted-foreground">
            No events yet. Create your first one.
          </p>
        ) : (
          <ul className="grid gap-3">
            {listings.map((event) => {
              const badge = statusBadge(event, now);
              return (
                <li
                  className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center"
                  key={event.id}
                >
                  <EventFlyer
                    category={event.category}
                    className="w-full sm:w-36"
                    startsAt={event.startsAt}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display font-semibold text-body-base">
                        {event.title}
                      </h2>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {event.visibility === "unlisted" ? (
                        <Badge variant="light-light">Unlisted</Badge>
                      ) : null}
                    </div>
                    <p className="text-caption text-muted-foreground">
                      {formatEventDate(event.startsAt)} · {event.venue},{" "}
                      {PARISH_LABELS[event.parish]}
                    </p>
                    <p className="text-caption">
                      {priceLabel(event)} · {event.goingCount} going
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {event.status === "published" ? (
                      <Link
                        className={cn(buttonVariants({ variant: "outline" }))}
                        href={`/events/${event.slug}`}
                      >
                        <ExternalLink data-icon="inline-start" />
                        View
                      </Link>
                    ) : null}
                    <Link
                      className={cn(buttonVariants())}
                      href={`/dash/events/${event.id}`}
                    >
                      Edit
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </DashShell>
  );
}
