import type { CurrentConditions } from "@/lib/current-conditions";
import type { Condition, ForecastDayData } from "@/lib/forecast-data";
import { UNAVAILABLE_SOURCE } from "@/lib/forecast-selection";
import {
  type DayPeriod,
  SAMPLE_DAYS,
  SAMPLE_NOW,
  SAMPLE_PERIODS,
  SAMPLE_SUN,
} from "@/lib/hero-samples";

/* Condition labels, from FastAPI `presentation.conditions` and older issues. */
const WIND_TILE = /^wind/i;
const HUMIDITY = /^humidity/i;
const RAIN_TILE = /^rain/i;
const PRESSURE = /^pressure/i;
const TIME_SEPARATOR = /,|;| and /;
const DIGITS = /\d+/;
const RAIN_CHANCE = /^(chance of rain|rain chance)/i;
const WIND_SPEED = /^wind speed|^wind$/i;
const WIND_DIRECTION = /^wind direction/i;
const GUSTS = /^gusts/i;
const WAVE_HEIGHT = /^wave height/i;
const SEA_STATE = /^sea state/i;
const HIGH_TIDE = /^high tide/i;
const LOW_TIDE = /^low tide/i;
const SUNRISE = /^sunrise/i;
const SUNSET = /^sunset/i;

export type ReadingIcon =
  | "air"
  | "dew"
  | "gusts"
  | "humidity"
  | "pressure"
  | "rain"
  | "seas"
  | "sunrise"
  | "sunset"
  | "tide-high"
  | "tide-low"
  | "visibility"
  | "wind";

/** One icon · value · label row on the sky hero. */
export interface Reading {
  icon: ReadingIcon;
  label: string;
  /** Neutral level word, e.g. "Good"; never a hazard colour. */
  tag?: string;
  value: string;
}

/** The Now card's readings: `primary` always shows, `extra` folds on phones. */
export function nowReadings(current: CurrentConditions): {
  extra: Reading[];
  primary: Reading[];
} {
  const tile = (pattern: RegExp) =>
    current.primary.find((item) => pattern.test(item.label));
  const wind = tile(WIND_TILE);
  const humidity = tile(HUMIDITY);
  const rain = tile(RAIN_TILE);
  const pressure = tile(PRESSURE);
  const primary: Reading[] = [];
  if (wind) primary.push({ icon: "wind", label: "Wind", value: wind.value });
  if (humidity)
    primary.push({
      icon: "humidity",
      label: "Humidity",
      value: humidity.value,
    });
  if (rain)
    primary.push({
      icon: "rain",
      label: rain.detail ? `Rain, ${rain.detail}` : "Rain",
      value: rain.value,
    });
  primary.push({
    icon: "air",
    label: "Air quality",
    tag: SAMPLE_NOW.airQuality.level,
    value: `${SAMPLE_NOW.airQuality.index} AQI`,
  });
  const extra: Reading[] = [
    { icon: "gusts", label: "Gusts", value: SAMPLE_NOW.gusts },
  ];
  if (current.dewPoint !== null)
    extra.push({
      icon: "dew",
      label: "Dew point",
      value: `${Math.round(current.dewPoint)}°`,
    });
  if (pressure)
    extra.push({ icon: "pressure", label: "Pressure", value: pressure.value });
  extra.push({
    icon: "visibility",
    label: "Visibility",
    value: SAMPLE_NOW.visibility,
  });
  return { extra, primary };
}

/** True when the day carries an issued forecast (not an outage or gap). */
export function isIssued(day: ForecastDayData): boolean {
  if (day.source === UNAVAILABLE_SOURCE) return false;
  return day.conditions.length > 0 || day.high !== null || day.low !== null;
}

const find = (conditions: Condition[], pattern: RegExp) =>
  conditions.find((item) => pattern.test(item.label));

/** "03:48, 16:02" or "2:15 p.m. and 3:00 a.m." → the first time only. */
function firstTime(value: string): string {
  return value.split(TIME_SEPARATOR)[0].trim();
}

function percent(value: string | undefined): number | null {
  const match = value?.match(DIGITS);
  return match ? Number(match[0]) : null;
}

/** The issued chance of rain, or the sample for this day offset. */
export function rainChance(day: ForecastDayData, index: number): number | null {
  if (!isIssued(day)) return null;
  const issued = percent(find(day.conditions, RAIN_CHANCE)?.value);
  return issued ?? SAMPLE_DAYS[index]?.rainChance ?? null;
}

/**
 * A day's forecast rows in reading order: rain, wind, gusts, seas, one high
 * and one low tide, sunrise, sunset. Issued values win; gaps take samples.
 */
export function dayReadings(day: ForecastDayData, index: number): Reading[] {
  if (!isIssued(day)) return [];
  const c = day.conditions;
  const sample = SAMPLE_DAYS[index] ?? SAMPLE_DAYS[0];
  const rows: Reading[] = [];
  const rain = rainChance(day, index);
  if (rain !== null)
    rows.push({ icon: "rain", label: "Chance of rain", value: `${rain}%` });

  const speed = find(c, WIND_SPEED);
  const direction = find(c, WIND_DIRECTION);
  if (speed)
    rows.push({
      icon: "wind",
      label: "Wind",
      value: [direction?.value, speed.value].filter(Boolean).join(" "),
    });
  rows.push({
    icon: "gusts",
    label: "Gusts",
    value: find(c, GUSTS)?.value ?? sample.gusts,
  });

  const waves = find(c, WAVE_HEIGHT);
  const sea = find(c, SEA_STATE);
  if (waves || sea)
    rows.push({
      icon: "seas",
      label: waves && sea ? `Seas, ${sea.value.toLowerCase()}` : "Seas",
      value: (waves ?? sea)?.value ?? "",
    });

  const high = find(c, HIGH_TIDE);
  const low = find(c, LOW_TIDE);
  rows.push(
    {
      icon: "tide-high",
      label: "High tide",
      value: high ? firstTime(high.value) : sample.highTide,
    },
    {
      icon: "tide-low",
      label: "Low tide",
      value: low ? firstTime(low.value) : sample.lowTide,
    },
    {
      icon: "sunrise",
      label: "Sunrise",
      value: find(c, SUNRISE)?.value ?? SAMPLE_SUN.sunrise,
    },
    {
      icon: "sunset",
      label: "Sunset",
      value: find(c, SUNSET)?.value ?? SAMPLE_SUN.sunset,
    }
  );
  return rows;
}

/** Morning / afternoon / night for an issued day; none for a gap. */
export function dayPeriods(day: ForecastDayData, index: number): DayPeriod[] {
  if (!isIssued(day)) return [];
  return [...(SAMPLE_PERIODS[index] ?? [])];
}
