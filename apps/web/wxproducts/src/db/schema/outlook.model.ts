/**
 * Tropical outlook Drizzle model.
 */

import { pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "@/db/schema/db-helpers";
import type { TropicalOutlookForecast } from "@/db/schema/outlook.schema";
import { products } from "@/db/schema/product-metadata.model";

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
