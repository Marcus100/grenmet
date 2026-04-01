/**
 * Tropical weather outlook forecast type and Zod schema.
 * geojson is typed as unknown for flexibility; use a GeoJSON type if you need stricter validation.
 * For a full product example, import gmsTropicalOutlookExample from @/data/gms-tropical-outlook.example.
 */

import { z } from "zod";
import type { ISODateTimeString } from "@/db/schema/primitives";
import type { Product } from "@/db/schema/product-metadata";
import { productSchema } from "@/db/schema/product-metadata";
import { isoDateTimeStringSchema } from "@/db/schema/zod-primitives";

export interface TropicalOutlookForecast {
  area_of_special_interest: { description: string; geojson: unknown };
  next_update_time_local: ISODateTimeString | null;
  outlook_type: "tropical_weather_outlook";
  public_message_plain_language: string;
  sources: Array<{
    source_name: string;
    source_type: "official" | "partner" | "internal";
    attribution_required: boolean;
    notes?: string | null;
  }>;
  systems: Array<{
    system_id: string;
    system_type: string;
    source_system_id: string | null;
    title: string;
    current_position_text: string;
    motion: {
      direction_text: string;
      speed: { min: number; max: number; unit: "mph" | "kt" };
    };
    development_probability?: {
      horizon_hours: number;
      probability_percent: number;
      classification: "low" | "medium" | "high";
    } | null;
    expected_weather_text: string;
    hazards_text: string[];
    ibf_assessment_id: string | null;
  }>;
}

export type TropicalOutlookProduct = Product<TropicalOutlookForecast>;

export const tropicalOutlookForecastSchema = z.object({
  outlook_type: z.literal("tropical_weather_outlook"),
  area_of_special_interest: z.object({
    description: z.string(),
    geojson: z.unknown().nullable(),
  }),
  sources: z.array(
    z.object({
      source_name: z.string(),
      source_type: z.enum(["official", "partner", "internal"]),
      attribution_required: z.boolean(),
      notes: z.string().nullable().optional(),
    })
  ),
  systems: z.array(
    z.object({
      system_id: z.string(),
      system_type: z.string(),
      source_system_id: z.string().nullable(),
      title: z.string(),
      current_position_text: z.string(),
      motion: z.object({
        direction_text: z.string(),
        speed: z.object({
          min: z.number(),
          max: z.number(),
          unit: z.enum(["mph", "kt"]),
        }),
      }),
      development_probability: z
        .object({
          horizon_hours: z.number(),
          probability_percent: z.number(),
          classification: z.enum(["low", "medium", "high"]),
        })
        .nullable()
        .optional(),
      expected_weather_text: z.string(),
      hazards_text: z.array(z.string()),
      ibf_assessment_id: z.string().nullable(),
    })
  ),
  next_update_time_local: isoDateTimeStringSchema.nullable(),
  public_message_plain_language: z.string(),
});

export const tropicalOutlookProductSchema = productSchema(
  tropicalOutlookForecastSchema
);

// ─── Drizzle ORM table ────────────────────────────────────────────────────────

import { pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "@/db/schema/db-helpers";
import { products } from "@/db/schema/product-metadata";

export const tropicalOutlookProducts = pgTable(
  "tropical_outlook_products",
  (t) => ({
    id: t.integer().generatedAlwaysAsIdentity().primaryKey(),
    productRef: t
      .integer()
      .notNull()
      .references(() => products.id),
    areaDescription: t.text().notNull(),
    areaGeojson: t.jsonb(),
    sources: t.jsonb().$type<TropicalOutlookForecast["sources"]>().notNull(),
    systems: t.jsonb().$type<TropicalOutlookForecast["systems"]>().notNull(),
    nextUpdateTimeLocal: t.text(),
    publicMessagePlainLanguage: t.text().notNull(),
    ...timestamps,
  }),
  (table) => [
    uniqueIndex("tropical_outlook_products_product_ref_idx").on(
      table.productRef
    ),
  ]
);

export type TropicalOutlookProductRow =
  typeof tropicalOutlookProducts.$inferSelect;
export type TropicalOutlookProductRowInsert =
  typeof tropicalOutlookProducts.$inferInsert;
