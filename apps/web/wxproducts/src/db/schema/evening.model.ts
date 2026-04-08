/**
 * Evening forecast Drizzle model.
 */

import { pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import type { EveningForecast } from "@/db/schema/evening.schema";
import { timestamps } from "@/db/schema/db-helpers";
import { products } from "@/db/schema/product-metadata.model";

export const eveningProducts = pgTable(
  "evening_products",
  (t) => ({
    id: t.integer().generatedAlwaysAsIdentity().primaryKey(),
    productRef: t
      .integer()
      .notNull()
      .references(() => products.id),
    headline: t.text().notNull(),
    periods: t.jsonb().$type<EveningForecast["periods"]>().notNull(),
    ...timestamps,
  }),
  (table) => [
    uniqueIndex("evening_products_product_ref_idx").on(table.productRef),
  ]
);

export type EveningProductRow = typeof eveningProducts.$inferSelect;
export type EveningProductRowInsert = typeof eveningProducts.$inferInsert;
