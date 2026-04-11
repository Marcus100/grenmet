/**
 * Midday forecast type and Zod schema.
 * For a full product example, import gmsMiddayWeatherReportExample from @/data/gms-midday-weather-report.example.
 */

import { z } from "zod";
import type { ElementsBlock } from "@/db/schema/elements.schema";
import { elementsBlockSchema } from "@/db/schema/elements.schema";
import type {
  CompassDirection,
  ISODateTimeString,
} from "@/db/schema/primitives";
import {
  compassDirectionSchema,
  isoDateTimeStringSchema,
} from "@/db/schema/primitives.schema";
import type { Product } from "@/db/schema/product-metadata.schema";
import { productSchema } from "@/db/schema/product-metadata.schema";

export interface MiddayStationObservation {
  /** Observed air temperature in °C. */
  air_temperature_c: number;
  /** Dewpoint temperature in °C. */
  dewpoint_c?: number | null;
  /** Observation time in local time (ISO 8601 with offset). */
  observation_time_local: ISODateTimeString;
  /** Altimeter setting (QNH) in hPa. */
  qnh_hpa?: number | null;
  /** Station name, e.g. "Maurice Bishop International Airport". */
  station_name: string;
  /** Reported wind direction as a compass point. */
  wind_direction?: CompassDirection | null;
  /** Reported wind speed in mph. */
  wind_speed_mph?: number | null;
}

export interface MiddayForecast {
  education?: {
    word_of_the_day?: { term: string; definition: string };
  } | null;
  elements: ElementsBlock;
  headline: string;
  station_observation: MiddayStationObservation;
}

export type MiddayForecastProduct = Product<MiddayForecast>;

export const middayStationObservationSchema = z.object({
  air_temperature_c: z.number().min(-10).max(50),
  dewpoint_c: z.number().min(-10).max(50).nullable().optional(),
  observation_time_local: isoDateTimeStringSchema,
  qnh_hpa: z.number().min(900).max(1080).nullable().optional(),
  station_name: z.string().min(1).max(100),
  wind_direction: compassDirectionSchema.nullable().optional(),
  wind_speed_mph: z.number().min(0).max(200).nullable().optional(),
});

export const middayForecastSchema = z.object({
  station_observation: middayStationObservationSchema,
  headline: z.string().min(1).max(300),
  elements: elementsBlockSchema,
  education: z
    .object({
      word_of_the_day: z
        .object({
          term: z.string().min(1).max(100),
          definition: z.string().min(1).max(500),
        })
        .optional(),
    })
    .nullable()
    .optional(),
});

export const middayProductSchema = productSchema(middayForecastSchema);
