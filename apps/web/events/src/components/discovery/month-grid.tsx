import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import type { PublicEvent } from "@/domain/types";
import { addDaysToKey, grenadaDateKey, grenadaWeekday } from "@/lib/datetime";
import { CATEGORY_STYLE } from "./category-style";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKS_SHOWN = 5;

/**
 * Five-week grid starting on the Monday of this week. Each day lists event
 * titles; on phones it collapses to coloured markers.
 */
export function MonthGrid({
  events,
  now,
}: {
  events: readonly PublicEvent[];
  now: Date;
}) {
  const today = grenadaDateKey(now);
  const mondayOffset = (grenadaWeekday(now) + 6) % 7;
  const start = addDaysToKey(today, -mondayOffset);
  const days = Array.from({ length: WEEKS_SHOWN * 7 }, (_, index) =>
    addDaysToKey(start, index)
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-7 border-border border-b bg-muted">
        {WEEKDAYS.map((weekday) => (
          <p
            className="px-2 py-2 text-center font-semibold text-caption text-muted-foreground"
            key={weekday}
          >
            {weekday}
          </p>
        ))}
      </div>
      <ol className="grid grid-cols-7">
        {days.map((key) => {
          const dayEvents = events.filter(
            (event) => grenadaDateKey(event.startsAt) === key
          );
          const isPast = key < today;
          return (
            <li
              aria-label={`${key}: ${dayEvents.length} events`}
              className={cn(
                "min-h-20 border-border border-r border-b p-1.5 sm:min-h-28",
                isPast && "bg-muted/50"
              )}
              key={key}
            >
              <p
                className={cn(
                  "mb-1 flex size-6 items-center justify-center rounded-full text-caption",
                  key === today
                    ? "bg-events-hibiscus font-semibold text-white"
                    : "text-muted-foreground"
                )}
              >
                {Number(key.slice(8))}
              </p>
              <ul className="space-y-1">
                {dayEvents.map((event) => (
                  <li key={event.id}>
                    <Link
                      className={cn(
                        "block truncate rounded-md px-1.5 py-0.5 font-medium text-micro sm:text-caption",
                        CATEGORY_STYLE[event.category].tone
                      )}
                      href={`/events/${event.slug}`}
                      title={event.title}
                    >
                      <span className="sr-only sm:not-sr-only">
                        {event.title}
                      </span>
                      <span aria-hidden="true" className="sm:hidden">
                        •
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
