/**
 * Marine forecast type and Zod schema.
 * For a full product example, import gmsMarineBulletinExample from @/data/wxproducts/gms-marine-bulletin.example.
 */

import { z } from "zod";
import type { ElementsBlock } from "@/db/wxproducts/schema/elements";
import { elementsBlockSchema } from "@/db/wxproducts/schema/elements";
import type { Product } from "@/db/wxproducts/schema/product-metadata";
import { productSchema } from "@/db/wxproducts/schema/product-metadata";

export interface MarineForecast {
  coastal_wave_notes?: { west?: string; east?: string } | null;
  color_code: "GREEN" | "YELLOW" | "ORANGE" | "RED";
  elements: ElementsBlock;
  response_summary_text?: string | null;
  synopsis: { summary: string };
}

export type MarineBulletinProduct = Product<MarineForecast>;

export const marineForecastSchema = z.object({
  color_code: z.enum(["GREEN", "YELLOW", "ORANGE", "RED"]),
  synopsis: z.object({ summary: z.string() }),
  elements: elementsBlockSchema,
  coastal_wave_notes: z
    .object({ west: z.string().optional(), east: z.string().optional() })
    .nullable()
    .optional(),
  response_summary_text: z.string().nullable().optional(),
});

export const marineProductSchema = productSchema(marineForecastSchema);

// ─── Drizzle ORM table ────────────────────────────────────────────────────────

import { index, pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "@/db/wxproducts/schema/db-helpers";
import { products } from "@/db/wxproducts/schema/product-metadata";

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
