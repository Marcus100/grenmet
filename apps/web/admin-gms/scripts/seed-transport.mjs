// One-time (re-runnable) seed for the GAA staff transportation timetable.
//
// Reads the hand-verified CSV (seed/transport-routes.csv), parses it with the
// unit-tested pure parser, and loads it into the transport Drizzle database.
// Idempotent: truncates and reloads every run. Node natively strips the types
// from the imported .ts modules (Node >= 22.18), so no build step / tsx needed.
//
//   pnpm --filter @grenmet/web-admin db:transport:seed
//
// Transcription note: place names were canonicalised from the source PDF so
// slug-dedup merges the same stop across routes/directions. OCR spelling fixes
// (Meville->Melville, Calivingy->Calivigny, Antroine->Antoine, M.B.I.A->MBIA)
// and per-route wording choices (Tivoli->Tivoli Junction, Gospel Hall->Gap
// Gospel Hall, Calivigny Main Road->Calivigny, St. Patrick's Anglican School->
// St. Patrick's Anglican Primary School). "Grand Anse" (routes 1,4) and "Grand
// Anse Valley" (routes 3,6) are kept distinct. Times follow the detailed per-run
// schedules where they differ from the memo summary table.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { parseSpec, SHIFTS } from "../src/db/transport/parse-spec.ts";
import {
  routes,
  shifts,
  stops,
  tripStops,
  trips,
} from "../src/db/transport/schema.ts";

const { Pool } = pg;

const url = process.env.TRANSPORT_DATABASE_URL ?? process.env.TRANSPORT_DB_URL;
if (!url) {
  console.error("TRANSPORT_DATABASE_URL environment variable is required");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = join(here, "..", "seed", "transport-routes.csv");
const spec = parseSpec(readFileSync(csvPath, "utf8"));

const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { casing: "snake_case" });

await pool.query(
  'TRUNCATE "routes","shifts","stops","trips","trip_stops" RESTART IDENTITY CASCADE'
);

const shiftRows = await db
  .insert(shifts)
  .values(
    SHIFTS.map((s) => ({
      slug: s.slug,
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      sortOrder: s.sortOrder,
    }))
  )
  .returning({ id: shifts.id });
const shiftIdBySlug = new Map(SHIFTS.map((s, i) => [s.slug, shiftRows[i].id]));

const routeRows = await db
  .insert(routes)
  .values(
    spec.routes.map((r) => ({
      number: r.number,
      name: r.name,
      sortOrder: r.sortOrder,
    }))
  )
  .returning({ id: routes.id });
const routeIdByNumber = new Map(
  spec.routes.map((r, i) => [r.number, routeRows[i].id])
);

const stopRows = await db
  .insert(stops)
  .values(
    spec.stops.map((s) => ({
      slug: s.slug,
      name: s.name,
      sortOrder: s.sortOrder,
    }))
  )
  .returning({ id: stops.id });
const stopIdBySlug = new Map(
  spec.stops.map((s, i) => [s.slug, stopRows[i].id])
);

const tripRows = await db
  .insert(trips)
  .values(
    spec.trips.map((t) => ({
      routeId: routeIdByNumber.get(t.routeNumber),
      shiftId: shiftIdBySlug.get(t.shiftSlug),
      direction: t.direction,
      dayType: t.dayType,
      departTime: t.departTime,
      arriveTime: t.arriveTime,
      sortOrder: t.sortOrder,
    }))
  )
  .returning({ id: trips.id });
const tripIdByKey = new Map(spec.trips.map((t, i) => [t.key, tripRows[i].id]));

await db.insert(tripStops).values(
  spec.tripStops.map((ts) => ({
    tripId: tripIdByKey.get(ts.tripKey),
    stopId: stopIdBySlug.get(ts.stopSlug),
    groupTime: ts.groupTime,
    sortOrder: ts.sortOrder,
  }))
);

console.log(
  `Seeded transport: ${spec.routes.length} routes, ${SHIFTS.length} shifts, ` +
    `${spec.stops.length} stops, ${spec.trips.length} trips, ${spec.tripStops.length} trip-stops`
);
await pool.end();
