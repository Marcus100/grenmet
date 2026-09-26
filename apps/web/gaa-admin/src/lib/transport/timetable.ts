// Pure helpers for the versioned staff-bus timetable (`/api/v1/transport/*`).
// Kept React-free so they are unit-testable.
import type {
  TimetableIssue,
  TimetableTripView,
  TimetableVersionState,
  TransportCatalogue,
  TransportRoute,
  TransportShift,
} from "@barrelsgd/api-client";

export interface ShiftGroup {
  shift: TransportShift;
  trips: TimetableTripView[];
}

export interface RouteGroup {
  route: TransportRoute;
  shifts: ShiftGroup[];
  tripCount: number;
}

/**
 * Group trips route → shift in registry order. Routes without trips are kept
 * only when `includeEmpty` is set (the draft editor needs them to add trips).
 */
export function groupTrips(
  trips: TimetableTripView[],
  catalogue: Pick<TransportCatalogue, "routes" | "shifts">,
  { includeEmpty = false }: { includeEmpty?: boolean } = {}
): RouteGroup[] {
  const groups: RouteGroup[] = [];
  for (const route of catalogue.routes) {
    const routeTrips = trips.filter((trip) => trip.routeId === route.id);
    if (routeTrips.length === 0 && !includeEmpty) continue;
    const shifts = catalogue.shifts
      .map((shift) => ({
        shift,
        trips: routeTrips.filter((trip) => trip.shiftId === shift.id),
      }))
      .filter((group) => group.trips.length > 0);
    groups.push({ route, shifts, tripCount: routeTrips.length });
  }
  return groups;
}

export function issuesByTrip(
  issues: TimetableIssue[]
): Map<number, TimetableIssue[]> {
  const byTrip = new Map<number, TimetableIssue[]>();
  for (const issue of issues) {
    if (issue.tripId == null) continue;
    byTrip.set(issue.tripId, [...(byTrip.get(issue.tripId) ?? []), issue]);
  }
  return byTrip;
}

export function hasBlockingIssues(issues: TimetableIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

/** Count trips awaiting confirmation (e.g. Route 6 pending GAA HR). */
export function awaitingConfirmation(trips: TimetableTripView[]): number {
  return trips.filter((trip) => trip.status === "awaiting_confirmation").length;
}

export const VERSION_STATE_LABELS = {
  draft: "Draft",
  scheduled: "Scheduled",
  current: "In force",
  superseded: "Superseded",
  discarded: "Discarded",
} as const satisfies Record<TimetableVersionState, string>;

/** Move an item by `delta` places, clamped to the list; returns a new array. */
export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const target = Math.min(Math.max(index + delta, 0), items.length - 1);
  if (target === index) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}
