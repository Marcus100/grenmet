/**
 * Morning forecast Drizzle model.
 */

import { pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "@/db/schema/db-helpers";
import type { ElementsBlock } from "@/db/schema/elements.schema";
import { products } from "@/db/schema/product-metadata.model";

export const morningProducts = pgTable(
  "morning_products",
  (t) => ({
    id: t.integer().generatedAlwaysAsIdentity().primaryKey(),
    productRef: t
      .integer()
      .notNull()
      .references(() => products.id),
    headline: t.text().notNull(),
    elements: t.jsonb().$type<ElementsBlock>().notNull(),
    productNotesAdvisories: t.jsonb().$type<string[] | null>(),
    ...timestamps,
  }),
  (table) => [
    uniqueIndex("morning_products_product_ref_idx").on(table.productRef),
  ]
);

export type MorningProductRow = typeof morningProducts.$inferSelect;
export type MorningProductRowInsert = typeof morningProducts.$inferInsert;
