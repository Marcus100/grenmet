/**
 * Shared weather/product elements used across marine, morning, midday, evening payloads.
 */

import type {
  CompassDirection,
  ISODateString,
  LocalTimeString,
} from "@/db/schema/primitives";

export interface ElementWind {
  direction_max: CompassDirection;
  direction_min: CompassDirection;
  /** Display text describing gusts, e.g. "gusting to 30 mph at times". */
  speed_gusting?: string | null;
  speed_max: number;
  speed_min: number;
  speed_unit: "mph" | "kt";
}

export interface ElementSeas {
  text: string;
  wave_max?: {
    context?: string | null;
    unit: "ft" | "m";
    value: number;
  } | null;
}

export interface ElementWeather {
  text: string;
}

export interface ElementVisibility {
  min?: { unit: "nm" | "km"; value: number } | null;
  text: string;
}

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
  moon_phase_last?: { date: ISODateString; phase: string } | null;
  moon_phase_next?: { date: ISODateString; phase: string } | null;
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

// ─── Zod schemas ──────────────────────────────────────────────────────────────
import { z } from "zod";
import {
  compassDirectionSchema,
  isoDateStringSchema,
  localTimeStringSchema,
} from "@/db/schema/primitives.schema";

export const elementWeatherSchema = z.object({
  text: z.string().min(1).max(500),
});

export const elementWindSchema = z.object({
  direction_min: compassDirectionSchema,
  direction_max: compassDirectionSchema,
  speed_min: z.number().int().min(0).max(200),
  speed_max: z.number().int().min(0).max(200),
  speed_unit: z.enum(["mph", "kt"]),
  speed_gusting: z.string().max(100).nullable().optional(),
});

export const elementSeasSchema = z.object({
  text: z.string().min(1).max(300),
  wave_max: z
    .object({
      value: z.number().min(0).max(100),
      unit: z.enum(["ft", "m"]),
      context: z.string().max(100).nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const elementVisibilitySchema = z.object({
  text: z.string().min(1).max(200),
  min: z
    .object({
      value: z.number().min(0).max(100),
      unit: z.enum(["nm", "km"]),
    })
    .nullable()
    .optional(),
});

export const elementTemperatureSchema = z.object({
  max_c: z.number().min(-10).max(50).nullable().optional(),
  min_c: z.number().min(-10).max(50).nullable().optional(),
});

export const tideEventSchema = z.object({
  type: z.enum(["high", "low"]),
  time_local: localTimeStringSchema,
});

export const elementTidesSchema = z.object({
  events: z.array(tideEventSchema).max(8),
});

export const sunMoonSchema = z.object({
  sunrise_local: localTimeStringSchema.nullable().optional(),
  sunset_local: localTimeStringSchema.nullable().optional(),
  sunrise_next_local: localTimeStringSchema.nullable().optional(),
  sunset_next_local: localTimeStringSchema.nullable().optional(),
  moon_phase_last: z
    .object({ phase: z.string().min(1).max(50), date: isoDateStringSchema })
    .nullable()
    .optional(),
  moon_phase_next: z
    .object({ phase: z.string().min(1).max(50), date: isoDateStringSchema })
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
