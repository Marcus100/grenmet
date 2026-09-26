import type {
  ServiceCalendarView,
  TimetableIssue,
  TimetableTripView,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import type { ReactNode } from "react";
import { formatDirection, formatTime } from "@/lib/transport/format";
import type { RouteGroup } from "@/lib/transport/timetable";
import { IssueList, TripStatusBadge } from "./portal";

/**
 * Timetable grouped route → shift → trip. Pure presentation: the draft editor
 * passes `tripActions` / `routeActions`; the read-only pages don't.
 */
export function TimetableView({
  calendars,
  groups,
  issues,
  routeActions,
  tripActions,
}: {
  calendars: ServiceCalendarView[];
  groups: RouteGroup[];
  issues?: Map<number, TimetableIssue[]>;
  routeActions?: (group: RouteGroup) => ReactNode;
  tripActions?: (trip: TimetableTripView) => ReactNode;
}) {
  const calendarName = new Map(calendars.map((c) => [c.id, c.name]));
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section
          aria-labelledby={`route-${group.route.id}`}
          className="space-y-3"
          key={group.route.id}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0">
              <h2
                className="font-semibold text-lg tracking-tight"
                id={`route-${group.route.id}`}
              >
                Route {group.route.number} — {group.route.name}
                {group.route.active ? null : (
                  <Badge className="ml-2 align-middle" variant="light-light">
                    Inactive
                  </Badge>
                )}
              </h2>
              {group.route.description ? (
                <p className="text-muted-foreground text-sm">
                  {group.route.description}
                </p>
              ) : null}
            </div>
            {routeActions?.(group)}
          </div>
          {group.shifts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No trips yet.</p>
          ) : null}
          {group.shifts.map(({ shift, trips }) => (
            <div className="space-y-2" key={shift.id}>
              <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {shift.name} shift · {formatTime(shift.startTime)}–
                {formatTime(shift.endTime)}
              </h3>
              <div className="grid gap-2">
                {trips.map((trip) => (
                  <TripCard
                    actions={tripActions?.(trip)}
                    calendar={calendarName.get(trip.calendarId) ?? ""}
                    issues={issues?.get(trip.id) ?? []}
                    key={trip.id}
                    trip={trip}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function TripCard({
  actions,
  calendar,
  issues,
  trip,
}: {
  actions?: ReactNode;
  calendar: string;
  issues: TimetableIssue[];
  trip: TimetableTripView;
}) {
  return (
    <details className="rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 font-medium text-sm">
        <span className="flex flex-wrap items-center gap-2">
          {formatDirection(trip.direction)}
          <Badge variant="light-light">{calendar}</Badge>
          <TripStatusBadge status={trip.status} />
        </span>
        <span className="shrink-0 font-mono text-muted-foreground text-xs">
          {formatTime(trip.departTime)}
          {trip.arriveTime ? ` → ${formatTime(trip.arriveTime)}` : ""}
        </span>
      </summary>
      <div className="space-y-3 border-border border-t px-4 py-3">
        {trip.notes ? (
          <p className="text-muted-foreground text-sm">{trip.notes}</p>
        ) : null}
        <IssueList issues={issues} />
        {trip.stops.length > 0 ? (
          <ol className="divide-y divide-border">
            {trip.stops.map((stop) => (
              <li
                className="flex items-center justify-between gap-3 py-2 text-sm"
                key={stop.sequence}
              >
                <span>{stop.stopName}</span>
                {stop.time ? (
                  <span className="shrink-0 font-mono text-muted-foreground text-xs">
                    {stop.timepoint ? "" : "≈ "}
                    {formatTime(stop.time)}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted-foreground text-sm">No stops listed.</p>
        )}
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
    </details>
  );
}
