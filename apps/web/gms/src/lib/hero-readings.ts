import { type CurrentConditions, localTime } from "@/lib/current-conditions";
import type { Condition, ForecastDayData } from "@/lib/forecast-data";
import { UNAVAILABLE_SOURCE } from "@/lib/forecast-selection";
import { sunTimes } from "@/lib/sky";
import { DEFAULT_UNITS, formatMeasure, type Measure } from "@/lib/units";
import type { WeatherCondition } from "@/lib/weather-icons";

/* Condition labels, from FastAPI `presentation.conditions` and older issues. */
const WIND_TILE = /^wind/i;
const HUMIDITY = /^humidity/i;
const RAIN_TILE = /^rain$/i;
const PRESSURE = /^pressure/i;
const CLOUD_COVER = /^cloud$/i;
const CLOUD_BASE = /^cloud base/i;
const RAIN_24H = /^rain, 24/i;
const HIGHEST = /^highest today/i;
const LOWEST = /^lowest today/i;
const TIME_SEPARATOR = /,|;| and /;
const DIGITS = /\d+/;
const RAIN_CHANCE = /^(chance of rain|rain chance)/i;
const WIND_SPEED = /^wind speed|^wind$/i;
const WIND_DIRECTION = /^wind direction/i;
const GUSTS = /^gusts/i;
const WAVE_HEIGHT = /^wave height/i;
const SEA_STATE = /^sea state/i;
const SWELL = /^swell/i;
const SWELL_DETAIL = /^swell · /i;
const HIGH_TIDE = /^high tide/i;
const LOW_TIDE = /^low tide/i;
const SUNRISE = /^sunrise/i;
const SUNSET = /^sunset/i;
const VISIBILITY = /^visibility/i;
const PARTLY = /partly|intervals|mostly sunny/i;
const SHOWERY = /shower|rain|drizzle|thunder|storm/i;
const SUNNY = /sun|clear|fair|fine/i;
const OVERCAST = /overcast|cloudy|cloud|haze|mist|fog/i;

export type ReadingIcon =
  | "air"
  | "cloud"
  | "dew"
  | "gusts"
  | "humidity"
  | "pressure"
  | "rain"
  | "rainfall"
  | "seas"
  | "sunrise"
  | "sunset"
  | "swell"
  | "temp-high"
  | "temp-low"
  | "tide-high"
  | "tide-low"
  | "uv"
  | "visibility"
  | "wind";

/**
 * Shown for a reading no real feed supplies yet; never a placeholder figure.
 * The grid draws a dash for it and reads this text to screen readers.
 */
export const NOT_AVAILABLE = "Not available yet";

export type PressureTrend = "falling" | "rising" | "steady";

/** One icon · value · label item in the sky hero's reading grid. */
export interface Reading {
  /** Small qualifier under the value, e.g. "Moderate" under a wave height. */
  detail?: string;
  icon: ReadingIcon;
  label: string;
  /** The numbers behind `value` (WMO units), so the grid can follow the unit switch. */
  measures?: Measure[];
  /** Neutral level word, e.g. "Good"; never a hazard colour. */
  tag?: string;
  /** Pressure tendency, drawn as an arrow beside the value. */
  trend?: PressureTrend;
  /** True when no real source supplies this reading yet. */
  unavailable?: boolean;
  value: string;
}

/** A reading from measures; `value` is the same text in the default units. */
function measured(
  icon: ReadingIcon,
  label: string,
  measures: Measure[],
  extra: Partial<Reading> = {}
): Reading | null {
  const texts = measures.map((measure) =>
    formatMeasure(measure, DEFAULT_UNITS)
  );
  if (texts.some((text) => text === null)) return null;
  return { ...extra, icon, label, measures, value: texts.join(" · ") };
}

/** A tile's reading: its numbers when it has them, otherwise its text. */
function fromTile(
  icon: ReadingIcon,
  label: string,
  tile: Condition,
  extra: Partial<Reading> = {}
): Reading {
  return (
    (tile.measure && measured(icon, label, [tile.measure], extra)) || {
      ...extra,
      icon,
      label,
      value: tile.value,
    }
  );
}

const missing = (icon: ReadingIcon, label: string): Reading => ({
  icon,
  label,
  unavailable: true,
  value: NOT_AVAILABLE,
});

/** Sunrise and sunset computed for a calendar day, as Grenada clock times. */
function computedSun(
  isoDate: string
): { sunrise: string; sunset: string } | null {
  if (Number.isNaN(Date.parse(`${isoDate}T12:00:00Z`))) return null;
  const { sunrise, sunset } = sunTimes(isoDate);
  return {
    sunrise: localTime(sunrise.toISOString()),
    sunset: localTime(sunset.toISOString()),
  };
}

/** Today's highest and lowest as one reading, or whichever one is reported. */
function todayExtremes(
  highest: Condition | undefined,
  lowest: Condition | undefined
): Reading | null {
  if (highest?.measure && lowest?.measure) {
    return measured("temp-high", "Highest · lowest today", [
      { ...highest.measure, bare: true },
      { ...lowest.measure, bare: true },
    ]);
  }
  const only = highest ?? lowest;
  if (!only) return null;
  return fromTile(highest ? "temp-high" : "temp-low", only.label, only);
}

/**
 * The Now tab's readings, in reading order: wind and gusts, humidity and dew
 * point, pressure and visibility, cloud and UV, rain, then air quality.
 * Only real register values appear; a field the register does not record
 * says NOT_AVAILABLE and never carries a stand-in figure.
 */
export function nowReadings(current: CurrentConditions): Reading[] {
  const tile = (pattern: RegExp) =>
    [...current.primary, ...current.extra].find((item) =>
      pattern.test(item.label)
    );
  const wind = tile(WIND_TILE);
  const humidity = tile(HUMIDITY);
  const rain = tile(RAIN_TILE);
  const pressure = tile(PRESSURE);
  const cloud = tile(CLOUD_COVER);
  const gusts = tile(GUSTS);
  const visibility = tile(VISIBILITY);
  const cloudBase = tile(CLOUD_BASE);
  const rain24 = tile(RAIN_24H);
  const highest = tile(HIGHEST);
  const lowest = tile(LOWEST);
  const rows: Reading[] = [];
  if (wind) rows.push(fromTile("wind", "Wind", wind));
  rows.push(
    gusts ? fromTile("gusts", "Gusts", gusts) : missing("gusts", "Gusts")
  );
  if (humidity)
    rows.push({ icon: "humidity", label: "Humidity", value: humidity.value });
  if (current.dewPoint !== null) {
    const dew = measured("dew", "Dew point", [
      { bare: true, low: current.dewPoint, places: 0, quantity: "temperature" },
    ]);
    if (dew) rows.push(dew);
  }
  if (pressure)
    rows.push(
      fromTile("pressure", "Pressure", pressure, {
        trend: current.pressureTrend ?? undefined,
      })
    );
  rows.push(
    visibility
      ? fromTile("visibility", "Visibility", visibility)
      : missing("visibility", "Visibility"),
    cloud
      ? { icon: "cloud", label: "Cloud cover", value: cloud.value }
      : missing("cloud", "Cloud cover"),
    cloudBase
      ? fromTile("cloud", "Cloud base", cloudBase, {
          detail: cloudBase.detail,
        })
      : missing("cloud", "Cloud base"),
    missing("uv", "UV index")
  );
  if (rain) rows.push(fromTile("rain", "Rain", rain));
  if (rain24) rows.push(fromTile("rain", "Rain, last 24 hours", rain24));
  const extremes = todayExtremes(highest, lowest);
  if (extremes) rows.push(extremes);
  rows.push(missing("air", "Air quality"));
  return rows;
}

/** True when the day carries an issued forecast (not an outage or gap). */
export function isIssued(day: ForecastDayData): boolean {
  if (day.source === UNAVAILABLE_SOURCE) return false;
  return day.conditions.length > 0 || day.high !== null || day.low !== null;
}

const find = (conditions: Condition[], pattern: RegExp) =>
  conditions.find((item) => pattern.test(item.label));

/** Every issued time for a tide kind, "04:12 · 16:30"; null when none. */
function tideTimes(conditions: Condition[], pattern: RegExp): string | null {
  const times = conditions
    .filter((item) => pattern.test(item.label))
    .flatMap((item) => item.value.split(TIME_SEPARATOR))
    .map((time) => time.trim())
    .filter(Boolean);
  return times.length > 0 ? times.join(" · ") : null;
}

function percent(value: string | undefined): number | null {
  const match = value?.match(DIGITS);
  return match ? Number(match[0]) : null;
}

/**
 * The issued chance of rain as shown: "Low", "Medium" or "High" (since 23
 * October 2026) or an older issue's percentage such as "40%"; null when the
 * day carries none.
 */
export function rainChance(day: ForecastDayData): string | null {
  if (!isIssued(day)) return null;
  const value = find(day.conditions, RAIN_CHANCE)?.value?.trim();
  if (!value) return null;
  const share = percent(value);
  return share === null ? value : `${share}%`;
}

/** Direction and speed as one Wind reading, following the unit switch when the speed has numbers. */
function dayWind(c: Condition[]): Reading | null {
  const speed = find(c, WIND_SPEED);
  if (!speed) return null;
  const direction = find(c, WIND_DIRECTION)?.value;
  const prefix = direction ? `${direction} ` : undefined;
  return (
    (speed.measure &&
      measured("wind", "Wind", [{ ...speed.measure, prefix }])) || {
      icon: "wind",
      label: "Wind",
      value: [direction, speed.value].filter(Boolean).join(" "),
    }
  );
}

/**
 * A day's forecast items in reading order, paired for two columns: wind and
 * gusts, chance of rain, seas and swell, sunrise and sunset, then high and low
 * tides. Only what a forecast issues appears: it carries no rainfall amount,
 * humidity, cloud cover, visibility, air quality, feels-like or UV (owner,
 * 28 Oct 2026). Sun times are computed from the date; a normally issued item
 * the forecaster left blank says NOT_AVAILABLE.
 */
export function dayReadings(day: ForecastDayData): Reading[] {
  if (!isIssued(day)) return [];
  const c = day.conditions;
  const sun = computedSun(day.date);
  const issuedOrMissing = (
    icon: ReadingIcon,
    label: string,
    value: string | undefined
  ): Reading => (value ? { icon, label, value } : missing(icon, label));
  const rows: Reading[] = [];

  const wind = dayWind(c);
  if (wind) rows.push(wind);
  const gusts = find(c, GUSTS);
  rows.push(
    gusts ? fromTile("gusts", "Gusts", gusts) : missing("gusts", "Gusts")
  );

  const rain = rainChance(day);
  rows.push(
    rain === null
      ? missing("rain", "Chance of rain")
      : { icon: "rain", label: "Chance of rain", value: rain }
  );

  const waves = find(c, WAVE_HEIGHT);
  const sea = find(c, SEA_STATE);
  if (waves || sea) {
    const lead = waves ?? sea;
    if (lead)
      rows.push(
        fromTile("seas", "Seas", lead, {
          detail: waves && sea ? sea.value : undefined,
        })
      );
  }
  // FastAPI: value "1.4 m", label "Swell · NE every 9 s"; or the text alone.
  const swell = find(c, SWELL);
  rows.push(
    swell
      ? fromTile("swell", "Swell", swell, {
          detail: SWELL_DETAIL.test(swell.label)
            ? swell.label.replace(SWELL_DETAIL, "")
            : undefined,
        })
      : missing("swell", "Swell"),
    issuedOrMissing(
      "sunrise",
      "Sunrise",
      find(c, SUNRISE)?.value ?? sun?.sunrise
    ),
    issuedOrMissing("sunset", "Sunset", find(c, SUNSET)?.value ?? sun?.sunset),
    issuedOrMissing(
      "tide-high",
      "High tides",
      tideTimes(c, HIGH_TIDE) ?? undefined
    ),
    issuedOrMissing(
      "tide-low",
      "Low tides",
      tideTimes(c, LOW_TIDE) ?? undefined
    )
  );
  return rows;
}

/** The sky picture for an observer's weather words, e.g. "Light shower". */
export function skyFromWords(words: string | null): WeatherCondition {
  if (!words) return "cloudy";
  if (SHOWERY.test(words)) return "showers";
  if (PARTLY.test(words)) return "partly-cloudy";
  if (OVERCAST.test(words) && SUNNY.test(words)) return "partly-cloudy";
  if (SUNNY.test(words)) return "sunny";
  return "cloudy";
}
