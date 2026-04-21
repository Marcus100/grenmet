/**
 * Zod schemas for shared primitives: date/time strings and ProductType.
 * IBF enums (likelihood, impact, response, sector) and ProductStatus live in ibf and product-metadata.
 */

import { z } from "zod";

const isoDateTimeRegex =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/;
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const localTimeRegex = /^\d{2}:\d{2}$/;

export const isoDateTimeStringSchema = z.string().regex(isoDateTimeRegex);
export const isoDateStringSchema = z.string().regex(isoDateRegex);
export const localTimeStringSchema = z.string().regex(localTimeRegex);

export const compassDirectionSchema = z.enum([
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
  "Variable",
  "Calm",
]);

export const productTypeSchema = z.enum([
  "marine_bulletin",
  "morning_forecast",
  "midday_weather_report",
  "evening_forecast",
  "tropical_weather_outlook",
]);
