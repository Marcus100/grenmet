/**
 * SYNOP surface observation Drizzle model. Source of truth for types: bufr.schema.ts.
 */

import { index, pgTable } from "drizzle-orm/pg-core";
import type { SynopObservation } from "@/db/wxproducts/schema/bufr.schema";
import { timestamps } from "@/db/wxproducts/schema/db-helpers";

/** SYNOP surface land observations. Encoded using BUFR (TM 307080). */
export const synopObservations = pgTable(
  "synop_observations",
  (t) => ({
    id: t.integer().generatedAlwaysAsIdentity().primaryKey(),
    /** WMO block+station number, e.g. "78954". */
    stationId: t.text().notNull(),
    stationName: t.text(),
    obsDatetimeUtc: t.timestamp({ withTimezone: true }).notNull(),
    body: t.jsonb().$type<SynopObservation>().notNull(),
    ...timestamps,
  }),
  (table) => [
    index("synop_obs_station_obs_time_idx").on(
      table.stationId,
      table.obsDatetimeUtc
    ),
    index("synop_obs_station_id_idx").on(table.stationId),
  ]
);

export type SynopObservationRow = typeof synopObservations.$inferSelect;
export type SynopObservationRowInsert = typeof synopObservations.$inferInsert;
