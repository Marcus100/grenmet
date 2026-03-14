/**
 * Marine bulletin payload type and Zod schema.
 * For a full product example, import gmsMarineBulletinExample from @/data/gms-marine-bulletin.example.
 */

import { z } from "zod";
import type { ElementsBlock } from "@/db/schema/elements";
import { elementsBlockSchema } from "@/db/schema/elements";
import type { Product } from "@/db/schema/product-metadata";
import { productSchema } from "@/db/schema/product-metadata";

export interface MarinePayload {
  coastal_wave_notes?: { west?: string; east?: string } | null;
  color_code: "GREEN" | "YELLOW" | "ORANGE" | "RED" | string;
  elements: ElementsBlock;
  response_summary_text?: string | null;
  synopsis: { summary: string };
}

/** Alias for naming consistency with MarineBulletinProduct and example usage. */
export type MarineBulletinPayload = MarinePayload;

export type MarineBulletinProduct = Product<MarinePayload>;

export const marinePayloadSchema = z.object({
  color_code: z.string(),
  synopsis: z.object({ summary: z.string() }),
  elements: elementsBlockSchema,
  coastal_wave_notes: z
    .object({ west: z.string().optional(), east: z.string().optional() })
    .nullable()
    .optional(),
  response_summary_text: z.string().nullable().optional(),
});

export const marineProductSchema = productSchema(marinePayloadSchema);
