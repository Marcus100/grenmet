/**
 * Evening forecast type (multi-day periods) and Zod schema.
 * For a full product example, import gmsEveningForecastExample from @/data/wxproducts/gms-evening-forecast.example.
 */

import { z } from "zod";
import type { ElementsBlock } from "@/db/wxproducts/schema/elements.schema";
import { elementsBlockSchema } from "@/db/wxproducts/schema/elements.schema";
import type {
  ISODateString,
  ISODateTimeString,
} from "@/db/wxproducts/schema/primitives";
import {
  isoDateStringSchema,
  isoDateTimeStringSchema,
} from "@/db/wxproducts/schema/primitives.schema";
import type { Product } from "@/db/wxproducts/schema/product-metadata.schema";
import { productSchema } from "@/db/wxproducts/schema/product-metadata.schema";

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
