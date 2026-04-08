/**
 * Aviation observations (METAR/SPECI) Drizzle model.
 */

import { index, pgEnum, pgTable } from "drizzle-orm/pg-core";
import type { AerodromeObservationReport } from "@/db/schema/metar-speci.schema";
import { timestamps } from "@/db/schema/db-helpers";

export const aviationReportTypeEnum = pgEnum("aviation_report_type", [
  "METAR",
  "SPECI",
]);

/** METAR and SPECI surface aviation observations. Encoded as IWXXM. */
export const aviationObservations = pgTable(
  "aviation_observations",
  (t) => ({
    id: t.integer().generatedAlwaysAsIdentity().primaryKey(),
    /** ICAO aerodrome designator, e.g. "TGPY". */
    aerodromeIcao: t.text().notNull(),
    reportType: aviationReportTypeEnum().notNull(),
    obsDatetimeUtc: t.timestamp({ withTimezone: true }).notNull(),
    issueDatetimeUtc: t.timestamp({ withTimezone: true }).notNull(),
    /** Original TAC string, if available. */
    rawTac: t.text(),
    body: t.jsonb().$type<AerodromeObservationReport>().notNull(),
    ...timestamps,
  }),
  (table) => [
    index("aviation_obs_aerodrome_obs_time_idx").on(
      table.aerodromeIcao,
      table.obsDatetimeUtc
    ),
    index("aviation_obs_report_type_idx").on(table.reportType),
  ]
);

export type AviationObservationRow = typeof aviationObservations.$inferSelect;
export type AviationObservationRowInsert =
  typeof aviationObservations.$inferInsert;
