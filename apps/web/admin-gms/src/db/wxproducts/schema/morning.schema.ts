/**
 * Morning forecast type and Zod schema.
 * For a full product example, import gmsMorningForecastExample from @/data/wxproducts/gms-morning-forecast.example.
 */

import { z } from "zod";
import type { ElementsBlock } from "@/db/wxproducts/schema/elements.schema";
import { elementsBlockSchema } from "@/db/wxproducts/schema/elements.schema";
import type { Product } from "@/db/wxproducts/schema/product-metadata.schema";
import { productSchema } from "@/db/wxproducts/schema/product-metadata.schema";

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
