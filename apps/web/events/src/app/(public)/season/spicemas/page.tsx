import { buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { PartyPopper } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EventCard } from "@/components/discovery/event-card";
import { toCardData } from "@/components/discovery/to-card";
import { listEvents, listProfiles } from "@/data/discovery";

export const metadata: Metadata = {
  title: "Spicemas season",
  description:
    "Band launches, fetes and carnival build-up events across Grenada.",
};

/**
 * Season hub: a curated collection by tag. Copy stays general — no official
 * dates or programme claims unless an organiser publishes them.
 */
export default async function SpicemasPage() {
  const now = new Date();
  const [events, profiles] = await Promise.all([
    listEvents({ tag: "spicemas" }, now),
    listProfiles(),
  ]);

  return (
    <div className="space-y-10">
      <header className="relative isolate overflow-hidden rounded-3xl bg-events-hibiscus p-6 text-white sm:p-12">
        <PartyPopper
          aria-hidden="true"
          className="absolute -right-10 -bottom-10 -z-10 size-64 opacity-15"
          strokeWidth={1.5}
        />
        <p className="font-semibold text-caption text-white/80 uppercase tracking-wide">
          Season hub
        </p>
        <h1 className="mt-2 font-bold font-display text-display tracking-tight">
          Spicemas season
        </h1>
        <p className="mt-3 max-w-xl text-body-base text-white/90">
          Band launches, fetes and the build-up to carnival — every season event
          listed on Barrels Events, in one place.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            className={cn(
              buttonVariants({ size: "lg" }),
              "bg-white text-events-ink hover:bg-white/90"
            )}
            href="/events?category=fete"
          >
            All fetes
          </Link>
          <Link
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
            )}
            href="/events/suggest"
          >
            Suggest a season event
          </Link>
        </div>
      </header>

      <section className="space-y-5">
        <h2 className="font-bold font-display text-heading-sm">Coming up</h2>
        {events.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard event={toCardData(event, profiles)} key={event.id} />
            ))}
          </div>
        ) : (
          <p className="text-body text-muted-foreground">
            No season events listed yet. Organisers can tag their events from
            the dashboard.
          </p>
        )}
      </section>
    </div>
  );
}
