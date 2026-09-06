/**
 * Shared IWXXM/aviation primitives for METAR/SPECI and TAF.
 * Single source of truth for Nil, Measure, Ref, Extension, AirportHeliport;
 * ISODateTime aliases app primitives for one datetime type across the app.
 */

import { z } from "zod";
import type { ISODateTimeString } from "./primitives";

export type ISODateTime = ISODateTimeString;

export type NilReason =
  | "noSignificantChange"
  | "nothingOfOperationalSignificance"
  | "noSignificantWeather"
  | "notDetectedByAutoSystem"
  | "notObservable"
  | "missing"
  | string;

export interface Nil<T extends object = Record<string, unknown>> {
  ext?: T;
  meta?: Record<string, unknown>;
  nilReason: NilReason;
  nilReasonDetail?: string;
}

export interface Measure {
  uom: string;
  value: number;
}

export type MeasureOrNil = Measure | Nil;

export interface Ref {
  href: string;
  title?: string;
}

export interface Extension {
  name?: string;
  namespace?: string;
  value?: unknown;
}

export interface AirportHeliport {
  designator: string;
  name?: string;
  position?: { lat: number; lon: number; elevM?: number };
}

// ---- Zod schemas ----
export const nilReasonSchema = z.string();
export const measureSchema = z.object({ uom: z.string(), value: z.number() });
export const nilSchema = z.object({
  nilReason: nilReasonSchema,
  nilReasonDetail: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  ext: z.record(z.string(), z.unknown()).optional(),
});
export const measureOrNilSchema = z.union([measureSchema, nilSchema]);
export const refSchema = z.object({
  href: z.string(),
  title: z.string().optional(),
});
export const extensionSchema = z.object({
  name: z.string().optional(),
  namespace: z.string().optional(),
  value: z.unknown().optional(),
});
export const airportHeliportSchema = z.object({
  designator: z.string(),
  name: z.string().optional(),
  position: z
    .object({
      lat: z.number(),
      lon: z.number(),
      elevM: z.number().optional(),
    })
    .optional(),
});

/** Re-export for use in aviation Zod schemas */
export { isoDateTimeStringSchema as isoDateTimeSchema } from "./zod-primitives";
