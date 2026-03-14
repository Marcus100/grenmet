/**
 * Evening forecast payload type (multi-day periods) and Zod schema.
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

export interface EveningPayload {
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

/** Alias for naming consistency with EveningForecastProduct and example usage. */
export type EveningForecastPayload = EveningPayload;

export type EveningForecastProduct = Product<EveningPayload>;

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

export const eveningPayloadSchema = z.object({
  headline: z.string(),
  periods: z.object({
    night: periodElementSchema,
    day_1: periodElementSchema,
    day_2: periodElementSchema,
    day_3: periodElementSchema,
  }),
});

export const eveningProductSchema = productSchema(eveningPayloadSchema);
