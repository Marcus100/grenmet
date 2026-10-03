import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { ExternalLink, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DashShell } from "@/components/dash/dash-shell";
import { EventFlyer } from "@/components/discovery/event-flyer";
import { getOrganiser, listOrganiserEvents } from "@/data/discovery";
import { PARISH_LABELS, priceLabel } from "@/domain/labels";
import { formatEventDate } from "@/lib/datetime";

/** Organiser data is per-user and live; never prerender it. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "My events" };

/** The demo organiser until organiser accounts are wired to auth. */
const DEMO_ORGANISER_ID = "org_feel_free";

export default async function DashEventsPage() {
  const now = new Date();
  const [organiser, events] = await Promise.all([
    getOrganiser(DEMO_ORGANISER_ID),
    listOrganiserEvents(DEMO_ORGANISER_ID, now),
  ]);

  return (
    <DashShell
      active="events"
      eventName={organiser?.name ?? "Organiser"}
      isDemo
    >
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display font-semibold text-heading-base">
              My events
            </h1>
            <p className="text-body text-muted-foreground">
              Listings for {organiser?.name}. Edit details, tiers and how each
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
        <ul className="grid gap-3">
          {events.map((event) => {
            const ended = new Date(event.endsAt) <= now;
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
                    <Badge variant={ended ? "light-light" : "light-success"}>
                      {ended ? "Ended" : "Published"}
                    </Badge>
                  </div>
                  <p className="text-caption text-muted-foreground">
                    {formatEventDate(event.startsAt)} · {event.venue},{" "}
                    {PARISH_LABELS[event.parish]}
                  </p>
                  <p className="text-caption">
                    {priceLabel(event)} · {event.goingIds.length} going
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    className={cn(buttonVariants({ variant: "outline" }))}
                    href={`/events/${event.slug}`}
                  >
                    <ExternalLink data-icon="inline-start" />
                    View
                  </Link>
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
      </main>
    </DashShell>
  );
}
