/**
 * Marine forecast Drizzle model.
 */

import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "@/db/schema/db-helpers";
import type { ElementsBlock } from "@/db/schema/elements.schema";
import { products } from "@/db/schema/product-metadata.model";

export const colorCodeEnum = pgEnum("color_code", [
  "GREEN",
  "ORANGE",
  "RED",
  "YELLOW",
]);

export const marineProducts = pgTable(
  "marine_products",
  (t) => ({
    id: t.integer().generatedAlwaysAsIdentity().primaryKey(),
    productRef: t
      .integer()
      .notNull()
      .references(() => products.id),
    colorCode: colorCodeEnum().notNull(),
    synopsisSummary: t.text().notNull(),
    elements: t.jsonb().$type<ElementsBlock>().notNull(),
    coastalWaveNotesWest: t.text(),
    coastalWaveNotesEast: t.text(),
    responseSummaryText: t.text(),
    ...timestamps,
  }),
  (table) => [
    uniqueIndex("marine_products_product_ref_idx").on(table.productRef),
    index("marine_products_color_code_idx").on(table.colorCode),
  ]
);

export type MarineProductRow = typeof marineProducts.$inferSelect;
export type MarineProductRowInsert = typeof marineProducts.$inferInsert;
