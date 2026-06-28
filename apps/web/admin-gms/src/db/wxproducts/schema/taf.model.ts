/**
 * TAF forecasts Drizzle model.
 */

import { index, pgTable } from "drizzle-orm/pg-core";
import { timestamps } from "@/db/wxproducts/schema/db-helpers";
import type { TAFReport } from "@/db/wxproducts/schema/taf.schema";

/** Terminal Aerodrome Forecasts. Encoded as IWXXM. */
export const tafForecasts = pgTable(
  "taf_forecasts",
  (t) => ({
    id: t.integer().generatedAlwaysAsIdentity().primaryKey(),
    aerodromeIcao: t.text().notNull(),
    issueDatetimeUtc: t.timestamp({ withTimezone: true }).notNull(),
    validFrom: t.timestamp({ withTimezone: true }).notNull(),
    validUntil: t.timestamp({ withTimezone: true }).notNull(),
    rawTac: t.text(),
    body: t.jsonb().$type<TAFReport>().notNull(),
    ...timestamps,
  }),
  (table) => [
    index("taf_forecasts_aerodrome_idx").on(table.aerodromeIcao),
    index("taf_forecasts_validity_idx").on(table.validFrom, table.validUntil),
    index("taf_forecasts_issue_datetime_idx").on(table.issueDatetimeUtc),
  ]
);

export type TafForecastRow = typeof tafForecasts.$inferSelect;
export type TafForecastRowInsert = typeof tafForecasts.$inferInsert;
