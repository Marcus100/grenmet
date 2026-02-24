/**
 * Shared weather/product elements used across marine, morning, midday, evening payloads.
 */

import type { ISODateString, LocalTimeString } from "@/app/schema/primitives";

export interface ForecastSpeedRange {
  max: number;
  min: number;
  unit: "mph" | "kt";
}

export interface ElementWind {
  direction_text: string;
  gusts_text?: string | null;
  speed_range: ForecastSpeedRange;
}

export interface ElementSeas {
  text: string;
  wave_max?: {
    value: number;
    unit: "ft" | "m";
    context?: string | null;
  } | null;
}

export interface ElementWeather {
  text: string;
}

export type ElementVisibility =
  | { text: string; min?: { value: number; unit: "nm" | "km" } | null }
  | { text: string };

export interface ElementTemperature {
  max_c?: number | null;
  min_c?: number | null;
}

export interface TideEvent {
  time_local: LocalTimeString;
  type: "high" | "low";
}

export interface ElementTides {
  events: TideEvent[];
}

export interface SunMoon {
  moon_phase_last?: { phase: string; date: ISODateString } | null;
  moon_phase_next?: { phase: string; date: ISODateString } | null;
  sunrise_local?: LocalTimeString | null;
  sunrise_next_local?: LocalTimeString | null;
  sunset_local?: LocalTimeString | null;
  sunset_next_local?: LocalTimeString | null;
}

export interface ElementsBlock {
  seas?: ElementSeas;
  sun_moon?: SunMoon;
  temperature?: ElementTemperature;
  tides?: ElementTides;
  visibility?: ElementVisibility;
  weather?: ElementWeather;
  wind?: ElementWind;
}

// Zod schemas for runtime validation
import { z } from "zod";
import {
  isoDateStringSchema,
  localTimeStringSchema,
} from "@/app/schema/zod-primitives";

export const forecastSpeedRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
  unit: z.enum(["mph", "kt"]),
});

export const elementWeatherSchema = z.object({ text: z.string() });

export const elementWindSchema = z.object({
  direction_text: z.string(),
  speed_range: forecastSpeedRangeSchema,
  gusts_text: z.string().nullable().optional(),
});

export const elementSeasSchema = z.object({
  text: z.string(),
  wave_max: z
    .object({
      value: z.number(),
      unit: z.enum(["ft", "m"]),
      context: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const elementVisibilitySchema = z.union([
  z.object({
    text: z.string(),
    min: z
      .object({ value: z.number(), unit: z.enum(["nm", "km"]) })
      .nullable()
      .optional(),
  }),
  z.object({ text: z.string() }),
]);

export const elementTemperatureSchema = z.object({
  max_c: z.number().nullable().optional(),
  min_c: z.number().nullable().optional(),
});

export const tideEventSchema = z.object({
  type: z.enum(["high", "low"]),
  time_local: localTimeStringSchema,
});

export const elementTidesSchema = z.object({
  events: z.array(tideEventSchema),
});

export const sunMoonSchema = z.object({
  sunrise_local: localTimeStringSchema.nullable().optional(),
  sunset_local: localTimeStringSchema.nullable().optional(),
  sunrise_next_local: localTimeStringSchema.nullable().optional(),
  sunset_next_local: localTimeStringSchema.nullable().optional(),
  moon_phase_last: z
    .object({ phase: z.string(), date: isoDateStringSchema })
    .nullable()
    .optional(),
  moon_phase_next: z
    .object({ phase: z.string(), date: isoDateStringSchema })
    .nullable()
    .optional(),
});

export const elementsBlockSchema = z.object({
  weather: elementWeatherSchema.optional(),
  wind: elementWindSchema.optional(),
  seas: elementSeasSchema.optional(),
  visibility: elementVisibilitySchema.optional(),
  temperature: elementTemperatureSchema.optional(),
  tides: elementTidesSchema.optional(),
  sun_moon: sunMoonSchema.optional(),
});
