/**
 * Evening forecast type (multi-day periods) and Zod schema.
 * For a full product example, import gmsEveningForecastExample from @/data/gms-evening-forecast.example.
 */

import { z } from "zod";
import type { ElementsBlock } from "@/db/schema/elements";
import { elementsBlockSchema } from "@/db/schema/elements";
import type { ISODateString, ISODateTimeString } from "@/db/schema/primitives";
import type { Product } from "@/db/schema/product-metadata";
import { productSchema } from "@/db/schema/product-metadata";
import {
  isoDateStringSchema,
  isoDateTimeStringSchema,
} from "@/db/schema/zod-primitives";

export interface EveningForecast {
  headline: string;
  periods: {
    night: {
      label: string;
      validity_window_local: {
        from: ISODateTimeString;
        to: ISODateTimeString;
        validity_text?: string;
      };
      elements: ElementsBlock;
    };
    day_1: {
      label: string;
      date_local: ISODateString;
      elements: ElementsBlock;
    };
    day_2: {
      label: string;
      date_local: ISODateString;
      elements: ElementsBlock;
    };
    day_3: {
      label: string;
      date_local: ISODateString;
      elements: ElementsBlock;
    };
  };
}

export type EveningForecastProduct = Product<EveningForecast>;

const periodElementSchema = z.object({
  label: z.string(),
  validity_window_local: z
    .object({
      from: isoDateTimeStringSchema,
      to: isoDateTimeStringSchema,
      validity_text: z.string().optional(),
    })
    .optional(),
  date_local: isoDateStringSchema.optional(),
  elements: elementsBlockSchema,
});

export const eveningForecastSchema = z.object({
  headline: z.string().min(1).max(300),
  periods: z.object({
    night: periodElementSchema,
    day_1: periodElementSchema,
    day_2: periodElementSchema,
    day_3: periodElementSchema,
  }),
});

export const eveningProductSchema = productSchema(eveningForecastSchema);

// ─── Drizzle ORM table ────────────────────────────────────────────────────────

import { pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "@/db/schema/db-helpers";
import { products } from "@/db/schema/product-metadata";

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
