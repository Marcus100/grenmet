import { clock12 } from "@/lib/clock";
import { type CurrentConditions, localTime } from "@/lib/current-conditions";
import type { Condition, ForecastDayData } from "@/lib/forecast-data";
import { UNAVAILABLE_SOURCE } from "@/lib/forecast-selection";
import { sunTimes } from "@/lib/sky";
import { DEFAULT_UNITS, formatMeasure, type Measure } from "@/lib/units";
import type { WeatherCondition } from "@/lib/weather-icons";

/* Condition labels, from FastAPI `presentation.conditions` and older issues. */
const HUMIDITY = /^humidity/i;
const RAIN_TILE = /^rain$/i;
const PRESSURE = /^pressure/i;
const CLOUD_BASE = /^cloud base/i;
const TIME_SEPARATOR = /,|;| and /;
const DIGITS = /\d+/;
const RAIN_CHANCE = /^(chance of rain|rain chance)/i;
const WAVE_HEIGHT = /^wave height/i;
const SEA_STATE = /^sea state/i;
const SWELL = /^swell/i;
const SWELL_DETAIL = /^swell · /i;
const HIGH_TIDE = /^high tide/i;
const LOW_TIDE = /^low tide/i;
const SUNRISE = /^sunrise/i;
const SUNSET = /^sunset/i;
const VISIBILITY = /^visibility/i;
/** Observer weather words that explain poor visibility (Saharan dust shows as haze). */
const OBSCURED = /haze|dust|sand|smoke|mist|fog/i;
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
  /**
   * One line per item, for a reading that lists several (each tide): a time
   * on top with its height underneath. When present the grid draws these
   * instead of `value`.
   */
  rows?: { measure?: Measure; time: string }[];
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

/**
 * The Now tab's panel: the measured readings the card above does not show
 * (it carries the temperature, sky, feels like, wind and gusts, and today's
 * highest and lowest). In reading order: humidity and dew point, pressure and
 * visibility, cloud base and rain. Only what the register recorded appears;
 * a missing reading is left out, never shown as a dash (owner, 29 Oct 2026).
 */
export function nowReadings(current: CurrentConditions): Reading[] {
  const tile = (pattern: RegExp) =>
    [...current.primary, ...current.extra].find((item) =>
      pattern.test(item.label)
    );
  const humidity = tile(HUMIDITY);
  const pressure = tile(PRESSURE);
  const visibility = tile(VISIBILITY);
  const cloudBase = tile(CLOUD_BASE);
  const rain = tile(RAIN_TILE);
  const rows: Reading[] = [];
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
  if (visibility) {
    // Dust and haze show in the observer's weather words, not as a number.
    const why = current.weather && OBSCURED.test(current.weather);
    rows.push(
      fromTile("visibility", "Visibility", visibility, {
        detail: why ? (current.weather ?? undefined) : undefined,
      })
    );
  }
  if (cloudBase)
    rows.push(
      fromTile("cloud", "Cloud base", cloudBase, { detail: cloudBase.detail })
    );
  if (rain)
    // The register records rain every 6 hours; say over how long.
    rows.push(
      fromTile("rain", rain.detail ? `Rain, ${rain.detail}` : "Rain", rain)
    );
  return rows;
}

/** True when the day carries an issued forecast (not an outage or gap). */
export function isIssued(day: ForecastDayData): boolean {
  if (day.source === UNAVAILABLE_SOURCE) return false;
  return day.conditions.length > 0 || day.high !== null || day.low !== null;
}

const find = (conditions: Condition[], pattern: RegExp) =>
  conditions.find((item) => pattern.test(item.label));

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

/** Every tide of one kind, each its time (a.m./p.m.) with its height when issued. */
function tides(conditions: Condition[], pattern: RegExp) {
  const rows = conditions
    .filter((item) => pattern.test(item.label))
    .flatMap((item) =>
      item.value
        .split(TIME_SEPARATOR)
        .map((time) => time.trim())
        .filter(Boolean)
        .map((time) => ({ measure: item.measure, time: clock12(time) }))
    );
  return rows.length > 0 ? rows : null;
}

/**
 * A forecast day's panel: the marine and sky details the card above does not
 * show (it carries the high and low, sky, chance of rain, wind and gusts). In
 * pairs for two columns: seas and swell, sunrise and sunset, high and low
 * tides. Sun times are computed from the date when not issued; anything else
 * missing is left out (owner, 29 Oct 2026). Times read a.m./p.m.
 */
export function dayReadings(day: ForecastDayData): Reading[] {
  if (!isIssued(day)) return [];
  const c = day.conditions;
  const sun = computedSun(day.date);
  const rows: Reading[] = [];
  const waves = find(c, WAVE_HEIGHT);
  const sea = find(c, SEA_STATE);
  const lead = waves ?? sea;
  if (lead)
    rows.push(
      fromTile("seas", "Seas", lead, {
        detail: waves && sea ? sea.value : undefined,
      })
    );
  // FastAPI: value "1.4 m", label "Swell · NE every 9 s"; or the text alone.
  const swell = find(c, SWELL);
  if (swell)
    rows.push(
      fromTile("swell", "Swell", swell, {
        detail: SWELL_DETAIL.test(swell.label)
          ? swell.label.replace(SWELL_DETAIL, "")
          : undefined,
      })
    );
  const sunrise = find(c, SUNRISE)?.value ?? sun?.sunrise;
  const sunset = find(c, SUNSET)?.value ?? sun?.sunset;
  if (sunrise)
    rows.push({ icon: "sunrise", label: "Sunrise", value: clock12(sunrise) });
  if (sunset)
    rows.push({
      icon: "sunset",
      label: "Sunset",
      value: clock12(sunset, { afternoon: true }),
    });
  const high = tides(c, HIGH_TIDE);
  const low = tides(c, LOW_TIDE);
  if (high)
    rows.push({
      icon: "tide-high",
      label: "High tides",
      rows: high,
      value: high.map((t) => t.time).join(" · "),
    });
  if (low)
    rows.push({
      icon: "tide-low",
      label: "Low tides",
      rows: low,
      value: low.map((t) => t.time).join(" · "),
    });
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
