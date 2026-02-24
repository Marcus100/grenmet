/**
 * Shared primitive types: date/time strings, Maybe, and ProductType.
 * Keep IDs stable to enable linking across products/IBF/CAP.
 */

export type ISODateTimeString = string; // e.g. "2026-02-23T05:00:00-04:00"
export type ISODateString = string; // e.g. "2026-02-23"
export type LocalTimeString = string; // e.g. "06:25"

/** Canonical nullable; used by BUFR/observation and product schemas. */
export type Maybe<T> = T | null;

export type ProductType =
  | "marine_bulletin"
  | "morning_forecast"
  | "midday_weather_report"
  | "evening_forecast"
  | "tropical_weather_outlook"
  | "metar"
  | "speci"
  | "taf";
