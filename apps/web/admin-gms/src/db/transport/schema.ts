import {
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  time,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * GAA staff transportation timetable (the "Staff Transportation System" memo).
 *
 * Hierarchy: route -> trip (journey) -> trip_stop (ordered stop). A trip is one
 * scheduled journey, keyed by (route, shift, direction, day_type):
 *   - direction: inbound = pickup run to MBIA; outbound = drop-off run from MBIA.
 *   - day_type:  daily | sun_hol (Sundays & public holidays only) | mon_sat.
 * Shifts (Morning/Afternoon/Night/Non-Shift) are a small fixed catalogue with
 * their operating window; stops are a shared, slug-deduplicated place catalogue
 * (MBIA, Melville Street, Woodlands... recur across routes).
 *
 * Times are stored structured as Postgres `time` (never the raw "3:30 a.m."
 * string) so downstream schedulers can compute departures and "next bus" state.
 * trip_stops.group_time is the batch pickup time a cluster of stops shares
 * (e.g. the 3:30 / 4:45 / 5:30 groupings on a morning inbound run); null when the
 * document lists a stop without its own time.
 */

export const busDirection = pgEnum("bus_direction", ["inbound", "outbound"]);
export const busDayType = pgEnum("bus_day_type", [
  "daily",
  "sun_hol",
  "mon_sat",
]);

export const routes = pgTable("routes", {
  id: serial("id").primaryKey(),
  number: integer("number").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const shifts = pgTable("shifts", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const stops = pgTable("stops", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const trips = pgTable(
  "trips",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id")
      .notNull()
      .references(() => routes.id),
    shiftId: integer("shift_id")
      .notNull()
      .references(() => shifts.id),
    direction: busDirection("direction").notNull(),
    dayType: busDayType("day_type").notNull(),
    departTime: time("depart_time").notNull(),
    // Nullable: outbound drop-off runs give a departure but no fixed arrival.
    arriveTime: time("arrive_time"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("uq_trips_route_shift_dir_day").on(
      table.routeId,
      table.shiftId,
      table.direction,
      table.dayType
    ),
    index("idx_trips_route").on(table.routeId),
    index("idx_trips_shift").on(table.shiftId),
  ]
);

export const tripStops = pgTable(
  "trip_stops",
  {
    id: serial("id").primaryKey(),
    tripId: integer("trip_id")
      .notNull()
      .references(() => trips.id),
    stopId: integer("stop_id")
      .notNull()
      .references(() => stops.id),
    // Batch pickup time a cluster of stops shares; null when unlisted.
    groupTime: time("group_time"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_trip_stops_trip").on(table.tripId),
    index("idx_trip_stops_stop").on(table.stopId),
  ]
);

export type Route = typeof routes.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type Stop = typeof stops.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type TripStop = typeof tripStops.$inferSelect;
