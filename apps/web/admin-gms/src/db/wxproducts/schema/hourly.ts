/**
 * Hourly summary — a derived product packaging the most recent METAR or SYNOP
 * observation for a given hour into a consistent ElementsBlock structure.
 *
 * Not an authored product; generated automatically by selecting the latest
 * available observation (METAR preferred, SYNOP as fallback) for each hour.
 */

import { z } from "zod";
import type { ElementsBlock } from "@/db/wxproducts/schema/elements";
import { elementsBlockSchema } from "@/db/wxproducts/schema/elements";
import type { ISODateTimeString } from "@/db/wxproducts/schema/primitives";
import { isoDateTimeStringSchema } from "@/db/wxproducts/schema/zod-primitives";

export type HourlySourceType = "metar" | "synop";

export interface HourlySummary {
  /** Normalised weather elements derived from the source observation. */
  elements: ElementsBlock;
  /** Optional plain-language remark added by the forecaster. */
  remarks?: string | null;
  /** External identifier of the source observation (aviation_observations or synop_observations). */
  source_report_id: string;
  /** Which observation type was used as the source. */
  source_type: HourlySourceType;
  /** UTC timestamp of the hour this summarises (e.g. "2026-03-27T09:00:00Z"). */
  valid_hour_utc: ISODateTimeString;
}

export const hourlySummarySchema = z.object({
  valid_hour_utc: isoDateTimeStringSchema,
  source_type: z.enum(["metar", "synop"]),
  source_report_id: z.string(),
  elements: elementsBlockSchema,
  remarks: z.string().nullable().optional(),
});

// ─── Drizzle ORM table ────────────────────────────────────────────────────────

import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "@/db/wxproducts/schema/db-helpers";
import { aviationObservations } from "@/db/wxproducts/schema/metarSpeci";
import { synopObservations } from "@/db/wxproducts/schema/synop";

export const obsSourceTypeEnum = pgEnum("obs_source_type", ["metar", "synop"]);

/**
 * Hourly weather summaries derived from the most recent METAR or SYNOP.
 * Exactly one of sourceMetarId / sourceSynopId will be non-null.
 */
export const hourlySummaries = pgTable(
  "hourly_summaries",
  (t) => ({
    id: t.integer().generatedAlwaysAsIdentity().primaryKey(),
    validHourUtc: t.timestamp({ withTimezone: true }).notNull(),
    sourceType: obsSourceTypeEnum().notNull(),
    sourceMetarId: t.integer().references(() => aviationObservations.id),
    sourceSynopId: t.integer().references(() => synopObservations.id),
    body: t.jsonb().$type<HourlySummary>().notNull(),
    ...timestamps,
  }),
  (table) => [
    uniqueIndex("hourly_summaries_valid_hour_idx").on(table.validHourUtc),
    index("hourly_summaries_source_type_idx").on(table.sourceType),
  ]
);

export type HourlySummaryRow = typeof hourlySummaries.$inferSelect;
export type HourlySummaryRowInsert = typeof hourlySummaries.$inferInsert;
