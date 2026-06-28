/**
 * Marine forecast type and Zod schema.
 * For a full product example, import gmsMarineBulletinExample from @/data/wxproducts/gms-marine-bulletin.example.
 */

import { z } from "zod";
import type { ElementsBlock } from "@/db/wxproducts/schema/elements.schema";
import { elementsBlockSchema } from "@/db/wxproducts/schema/elements.schema";
import type { Product } from "@/db/wxproducts/schema/product-metadata.schema";
import { productSchema } from "@/db/wxproducts/schema/product-metadata.schema";

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
