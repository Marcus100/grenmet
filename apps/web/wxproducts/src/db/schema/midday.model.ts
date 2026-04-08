/**
 * Midday forecast Drizzle model.
 */

import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import type { ElementsBlock } from "@/db/schema/elements.schema";
import { timestamps } from "@/db/schema/db-helpers";
import { products } from "@/db/schema/product-metadata.model";

export const middayProducts = pgTable(
  "midday_products",
  (t) => ({
    id: t.integer().generatedAlwaysAsIdentity().primaryKey(),
    productRef: t
      .integer()
      .notNull()
      .references(() => products.id),
    stationName: t.text().notNull(),
    observationTimeLocal: t.text().notNull(),
    airTemperatureC: t.numeric({ precision: 5, scale: 2 }).notNull(),
    headline: t.text().notNull(),
    elements: t.jsonb().$type<ElementsBlock>().notNull(),
    educationWordTerm: t.text(),
    educationWordDefinition: t.text(),
    ...timestamps,
  }),
  (table) => [
    uniqueIndex("midday_products_product_ref_idx").on(table.productRef),
    index("midday_products_station_name_idx").on(table.stationName),
  ]
);

export type MiddayProductRow = typeof middayProducts.$inferSelect;
export type MiddayProductRowInsert = typeof middayProducts.$inferInsert;
