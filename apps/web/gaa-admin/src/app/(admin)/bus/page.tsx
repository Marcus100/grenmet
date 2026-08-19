import type { Metadata } from "next";
import {
  formatDayType,
  formatDirection,
  formatTime,
} from "@/db/transport/parse-spec";
import { getTransportSpec } from "@/db/transport/queries";

export const metadata: Metadata = {
  title: "Bus",
  description:
    "GAA staff transportation timetable — routes, shifts, and pickup/drop-off schedules.",
};

export const dynamic = "force-dynamic";

export default async function BusPage() {
  const routes = await getTransportSpec();
  const totalTrips = routes.reduce(
    (count, route) =>
      count + route.shifts.reduce((sum, shift) => sum + shift.trips.length, 0),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Staff Transportation
        </h1>
        <p className="text-muted-foreground text-sm">
          GAA staff bus timetable — routes, shifts, and pickup/drop-off points.{" "}
          {routes.length} routes · {totalTrips} scheduled runs.
        </p>
      </div>

      {routes.map((route) => (
        <section className="space-y-4" key={route.id}>
          <h2 className="font-semibold text-lg tracking-tight">
            Route {route.number} — {route.name}
          </h2>
          {route.shifts.map((shift) => (
            <div className="space-y-2" key={`shift-${shift.id}`}>
              <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {shift.name} · {formatTime(shift.startTime)}–
                {formatTime(shift.endTime)}
              </h3>
              <div className="grid gap-2">
                {shift.trips.map((trip) => (
                  <details
                    className="rounded-lg border border-border bg-card"
                    key={trip.id}
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-3 font-medium text-sm">
                      <span className="flex items-center gap-2">
                        {formatDirection(trip.direction)}
                        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                          {formatDayType(trip.dayType)}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-muted-foreground text-xs">
                        {formatTime(trip.departTime)}
                        {trip.arriveTime
                          ? ` → ${formatTime(trip.arriveTime)}`
                          : ""}
                      </span>
                    </summary>
                    <ol className="divide-y divide-border border-border border-t">
                      {trip.stops.map((stop) => (
                        <li
                          className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
                          key={stop.id}
                        >
                          <span>{stop.name}</span>
                          {stop.groupTime ? (
                            <span className="shrink-0 font-mono text-muted-foreground text-xs">
                              {formatTime(stop.groupTime)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
