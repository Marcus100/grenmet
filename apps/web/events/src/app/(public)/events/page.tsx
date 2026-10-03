import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import { cn } from "@barrelsgd/ui/lib/utils";
import { CalendarDays, List, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EventCard } from "@/components/discovery/event-card";
import { FilterBar } from "@/components/discovery/filter-bar";
import { MonthGrid } from "@/components/discovery/month-grid";
import { toCardData } from "@/components/discovery/to-card";
import {
  type DayGroup,
  groupByDay,
  isTonight,
  listEvents,
  listProfiles,
  parseFilters,
} from "@/data/discovery";
import type { Profile, PublicEvent } from "@/domain/types";
import { formatDayKey, grenadaDateKey } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Calendar",
  description:
    "Every upcoming event in Grenada, filtered by date, parish and category.",
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const view = params.view === "month" ? "month" : "list";
  const now = new Date();
  const [events, profiles] = await Promise.all([
    listEvents(filters, now),
    listProfiles(),
  ]);
  const days = groupByDay(events);
  const today = grenadaDateKey(now);

  const viewHref = (next: "list" | "month") => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && key !== "view") {
        query.set(key, value);
      }
    }
    query.set("view", next);
    return `/events?${query.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-bold font-display text-heading-base tracking-tight sm:text-heading-md">
            What's on
          </h1>
          <p className="mt-1 text-body text-muted-foreground">
            {events.length} {events.length === 1 ? "event" : "events"} match
          </p>
        </div>
        <div className="flex items-center gap-2">
          <nav aria-label="View" className="flex rounded-full bg-muted p-1">
            {(
              [
                ["list", "List", List],
                ["month", "Month", CalendarDays],
              ] as const
            ).map(([value, label, Icon]) => (
              <Link
                aria-current={view === value ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium text-caption",
                  view === value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground"
                )}
                href={viewHref(value)}
                key={value}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
          <Link
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-medium text-caption hover:border-foreground"
            href="/events/suggest"
          >
            <Plus className="size-4" />
            Suggest
          </Link>
        </div>
      </div>

      <FilterBar filters={filters} view={view} />

      <Results
        days={days}
        events={events}
        now={now}
        profiles={profiles}
        today={today}
        view={view}
      />
    </div>
  );
}

function Results({
  days,
  events,
  now,
  profiles,
  today,
  view,
}: {
  days: readonly DayGroup[];
  events: readonly PublicEvent[];
  now: Date;
  profiles: readonly Profile[];
  today: string;
  view: "list" | "month";
}) {
  if (events.length === 0) {
    return (
      <Empty className="rounded-2xl border border-border border-dashed">
        <EmptyHeader>
          <EmptyTitle>No events match those filters</EmptyTitle>
          <EmptyDescription>
            Try a wider date range, or{" "}
            <Link className="underline" href="/events/suggest">
              suggest an event
            </Link>{" "}
            we're missing.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (view === "month") {
    return <MonthGrid events={events} now={now} />;
  }
  return (
    <div className="space-y-10">
      {days.map((day) => (
        <section
          aria-labelledby={`day-${day.key}`}
          className="grid gap-4 md:grid-cols-[12rem_1fr]"
          key={day.key}
        >
          <h2
            className="font-display font-semibold text-body-base md:sticky md:top-20 md:self-start"
            id={`day-${day.key}`}
          >
            {day.key === today ? "Today" : formatDayKey(day.key)}
          </h2>
          <div className="grid gap-6">
            {day.events.map((event) => (
              <EventCard
                event={toCardData(event, profiles)}
                highlight={isTonight(event, now) ? "Tonight" : undefined}
                key={event.id}
                layout="row"
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
