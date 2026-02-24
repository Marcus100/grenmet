/**
 * Morning forecast payload type and Zod schema.
 * For a full product example, import gmsMorningForecastExample from @/data/gms-morning-forecast.example.
 */

import { z } from "zod";
import type { ElementsBlock } from "@/app/schema/elements";
import { elementsBlockSchema } from "@/app/schema/elements";
import type { Product } from "@/app/schema/product-metadata";
import { productSchema } from "@/app/schema/product-metadata";

export interface MorningPayload {
  elements: ElementsBlock;
  headline: string;
  product_notes?: { advisories_text?: string[] } | null;
}

/** Alias for naming consistency with MorningForecastProduct and example usage. */
export type MorningForecastPayload = MorningPayload;

export type MorningForecastProduct = Product<MorningPayload>;

export const morningPayloadSchema = z.object({
  headline: z.string(),
  elements: elementsBlockSchema,
  product_notes: z
    .object({ advisories_text: z.array(z.string()).optional() })
    .nullable()
    .optional(),
});

export const morningProductSchema = productSchema(morningPayloadSchema);
