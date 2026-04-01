/**
 * Morning forecast type and Zod schema.
 * For a full product example, import gmsMorningForecastExample from @/data/gms-morning-forecast.example.
 */

import { z } from "zod";
import type { ElementsBlock } from "@/db/schema/elements";
import { elementsBlockSchema } from "@/db/schema/elements";
import type { Product } from "@/db/schema/product-metadata";
import { productSchema } from "@/db/schema/product-metadata";

export interface MorningForecast {
  elements: ElementsBlock;
  headline: string;
  product_notes?: {
    advisories_text?: string[];
    /** Optional "looking ahead" sentence for tomorrow or upcoming days. */
    outlook_text?: string | null;
  } | null;
}

export type MorningForecastProduct = Product<MorningForecast>;

export const morningForecastSchema = z.object({
  headline: z.string().min(1).max(300),
  elements: elementsBlockSchema,
  product_notes: z
    .object({
      advisories_text: z.array(z.string().min(1).max(300)).optional(),
      outlook_text: z.string().min(1).max(500).nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const morningProductSchema = productSchema(morningForecastSchema);

// ─── Drizzle ORM table ────────────────────────────────────────────────────────

import { pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "@/db/schema/db-helpers";
import { products } from "@/db/schema/product-metadata";

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
