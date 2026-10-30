import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@barrelsgd/ui/components/ui/empty";
import { cn } from "@barrelsgd/ui/lib/utils";
import { CalendarDays, List, Plus } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { EventCard } from "@/components/discovery/event-card";
import { FilterBar } from "@/components/discovery/filter-bar";
import { MonthGrid } from "@/components/discovery/month-grid";
import {
  type DayGroup,
  groupByDay,
  isTonight,
  parseFilters,
} from "@/data/discovery";
import { listEvents } from "@/data/events-api";
import type { PublicEvent } from "@/domain/types";
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
  const events = await listEvents(filters);
  const days = groupByDay(events);
  const today = grenadaDateKey(now);

  const viewHref = (next: "list" | "month"): Route => {
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
          <h1 className="font-display text-heading-base sm:text-heading-md font-bold tracking-tight">
            What's on
          </h1>
          <p className="text-body text-muted-foreground mt-1">
            {events.length} {events.length === 1 ? "event" : "events"} match
          </p>
        </div>
        <div className="flex items-center gap-2">
          <nav aria-label="View" className="bg-muted flex rounded-full p-1">
            {(
              [
                ["list", "List", List],
                ["month", "Month", CalendarDays],
              ] as const
            ).map(([value, label, Icon]) => (
              <Link
                aria-current={view === value ? "page" : undefined}
                className={cn(
                  "text-caption flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium",
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
            className="border-border text-caption hover:border-foreground flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium"
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
  today,
  view,
}: {
  days: readonly DayGroup[];
  events: readonly PublicEvent[];
  now: Date;
  today: string;
  view: "list" | "month";
}) {
  if (events.length === 0) {
    return (
      <Empty className="border-border rounded-2xl border border-dashed">
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
            className="font-display text-body-base font-semibold md:sticky md:top-20 md:self-start"
            id={`day-${day.key}`}
          >
            {day.key === today ? "Today" : formatDayKey(day.key)}
          </h2>
          <div className="grid gap-6">
            {day.events.map((event) => (
              <EventCard
                event={event}
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
