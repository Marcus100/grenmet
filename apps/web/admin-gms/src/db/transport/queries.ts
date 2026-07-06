import "server-only";

import { asc } from "drizzle-orm";
import { transportDb as db } from "./index";
import type { DayType, Direction } from "./parse-spec";
import { routes, shifts, stops, tripStops, trips } from "./schema";

export interface StopView {
  groupTime: string | null;
  id: number;
  name: string;
}

export interface TripView {
  arriveTime: string | null;
  dayType: DayType;
  departTime: string;
  direction: Direction;
  id: number;
  stops: StopView[];
}

export interface ShiftGroupView {
  endTime: string;
  id: number;
  name: string;
  startTime: string;
  trips: TripView[];
}

export interface RouteView {
  id: number;
  name: string;
  number: number;
  shifts: ShiftGroupView[];
}

/**
 * Fetch the full timetable as a nested route -> shift-group -> trip -> stop tree
 * for the read-only view. Within a route, only shifts that actually run appear,
 * in shift sort order; trips and stops preserve their DB sort order.
 */
export async function getTransportSpec(): Promise<RouteView[]> {
  const [routeRows, shiftRows, stopRows, tripRows, tripStopRows] =
    await Promise.all([
      db.select().from(routes).orderBy(asc(routes.sortOrder)),
      db.select().from(shifts).orderBy(asc(shifts.sortOrder)),
      db.select().from(stops),
      db.select().from(trips).orderBy(asc(trips.sortOrder)),
      db.select().from(tripStops).orderBy(asc(tripStops.sortOrder)),
    ]);

  const stopName = new Map(stopRows.map((s) => [s.id, s.name]));

  const tripView = new Map<number, TripView>(
    tripRows.map((t) => [
      t.id,
      {
        id: t.id,
        direction: t.direction,
        dayType: t.dayType,
        departTime: t.departTime,
        arriveTime: t.arriveTime,
        stops: [],
      },
    ])
  );
  for (const ts of tripStopRows) {
    tripView.get(ts.tripId)?.stops.push({
      id: ts.id,
      name: stopName.get(ts.stopId) ?? "Unknown",
      groupTime: ts.groupTime,
    });
  }

  return routeRows.map((route) => {
    const routeTrips = tripRows.filter((t) => t.routeId === route.id);

    const groups: ShiftGroupView[] = [];
    // Shifts in catalogue order, but only those that run on this route.
    for (const shift of shiftRows) {
      const shiftTrips = routeTrips.filter((t) => t.shiftId === shift.id);
      if (shiftTrips.length === 0) {
        continue;
      }
      groups.push({
        id: shift.id,
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        trips: shiftTrips.map((t) => tripView.get(t.id) as TripView),
      });
    }

    return {
      id: route.id,
      number: route.number,
      name: route.name,
      shifts: groups,
    };
  });
}
