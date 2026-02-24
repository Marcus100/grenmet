/**
 * Midday weather report payload type and Zod schema.
 * For a full product example, import gmsMiddayWeatherReportExample from @/data/gms-midday-weather-report.example.
 */

import { z } from "zod";
import type { ElementsBlock } from "@/app/schema/elements";
import { elementsBlockSchema } from "@/app/schema/elements";
import type { ISODateTimeString } from "@/app/schema/primitives";
import type { Product } from "@/app/schema/product-metadata";
import { productSchema } from "@/app/schema/product-metadata";
import { isoDateTimeStringSchema } from "@/app/schema/zod-primitives";

export interface MiddayPayload {
  education?: {
    word_of_the_day?: { term: string; definition: string };
  } | null;
  elements: ElementsBlock;
  headline: string;
  station_observation: {
    station_name: string;
    observation_time_local: ISODateTimeString;
    air_temperature_c: number;
  };
}

/** Alias for naming consistency with MiddayWeatherReportProduct and example usage. */
export type MiddayWeatherReportPayload = MiddayPayload;

export type MiddayWeatherReportProduct = Product<MiddayPayload>;

export const middayPayloadSchema = z.object({
  station_observation: z.object({
    station_name: z.string(),
    observation_time_local: isoDateTimeStringSchema,
    air_temperature_c: z.number(),
  }),
  headline: z.string(),
  elements: elementsBlockSchema,
  education: z
    .object({
      word_of_the_day: z
        .object({ term: z.string(), definition: z.string() })
        .optional(),
    })
    .nullable()
    .optional(),
});

export const middayProductSchema = productSchema(middayPayloadSchema);
