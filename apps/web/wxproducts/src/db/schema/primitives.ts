/**
 * Shared primitive types: date/time strings, Maybe, and ProductType.
 * Keep IDs stable to enable linking across products/IBF/CAP.
 */

export type ISODateTimeString = string; // e.g. "2026-02-23T05:00:00-04:00"
export type ISODateString = string; // e.g. "2026-02-23"
export type LocalTimeString = string; // e.g. "06:25"

/** Canonical nullable; used by BUFR/observation and product schemas. */
export type Maybe<T> = T | null;

/** 16-point compass rose + Calm/Variable. Used for wind direction fields. */
export type CompassDirection =
  | "N"
  | "NNE"
  | "NE"
  | "ENE"
  | "E"
  | "ESE"
  | "SE"
  | "SSE"
  | "S"
  | "SSW"
  | "SW"
  | "WSW"
  | "W"
  | "WNW"
  | "NW"
  | "NNW"
  | "Variable"
  | "Calm";

/** Product types for authored daily/marine/tropical forecast products only.
 *  Aviation observations (METAR, SPECI, TAF) and surface obs (SYNOP) are stored
 *  in their own standalone tables and are not part of the products hierarchy. */
export type ProductType =
  | "marine_bulletin"
  | "morning_forecast"
  | "midday_weather_report"
  | "evening_forecast"
  | "tropical_weather_outlook";
