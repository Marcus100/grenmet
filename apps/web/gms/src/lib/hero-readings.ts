import type { CurrentConditions } from "@/lib/current-conditions";
import type { Condition, ForecastDayData } from "@/lib/forecast-data";
import { UNAVAILABLE_SOURCE } from "@/lib/forecast-selection";
import { SAMPLE_DAYS, SAMPLE_NOW, SAMPLE_SUN } from "@/lib/hero-samples";
import type { WeatherCondition } from "@/lib/weather-icons";

/* Condition labels, from FastAPI `presentation.conditions` and older issues. */
const WIND_TILE = /^wind/i;
const HUMIDITY = /^humidity/i;
const RAIN_TILE = /^rain$/i;
const PRESSURE = /^pressure/i;
const CLOUD = /^cloud/i;
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
  | "tide-high"
  | "tide-low"
  | "uv"
  | "visibility"
  | "wind";

export type PressureTrend = "falling" | "rising" | "steady";

/** One icon · value · label item in the sky hero's reading grid. */
export interface Reading {
  /** Small qualifier under the value, e.g. "Moderate" under a wave height. */
  detail?: string;
  icon: ReadingIcon;
  label: string;
  /** Neutral level word, e.g. "Good"; never a hazard colour. */
  tag?: string;
  /** Pressure tendency, drawn as an arrow beside the value. */
  trend?: PressureTrend;
  value: string;
}

/**
 * The Now tab's readings, in reading order: wind and gusts, humidity and dew
 * point, pressure and visibility, cloud and UV, rain, then air quality.
 * Register values win; fields the register does not record take samples.
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
  const cloud = tile(CLOUD);
  const rows: Reading[] = [];
  if (wind) rows.push({ icon: "wind", label: "Wind", value: wind.value });
  rows.push({ icon: "gusts", label: "Gusts", value: SAMPLE_NOW.gusts });
  if (humidity)
    rows.push({ icon: "humidity", label: "Humidity", value: humidity.value });
  if (current.dewPoint !== null)
    rows.push({
      icon: "dew",
      label: "Dew point",
      value: `${Math.round(current.dewPoint)}°`,
    });
  if (pressure)
    rows.push({
      icon: "pressure",
      label: "Pressure",
      trend: current.pressureTrend ?? undefined,
      value: pressure.value,
    });
  rows.push(
    { icon: "visibility", label: "Visibility", value: SAMPLE_NOW.visibility },
    {
      icon: "cloud",
      label: "Cloud cover",
      value: cloud?.value ?? SAMPLE_NOW.cloudCover,
    },
    { icon: "uv", label: "UV index", value: SAMPLE_NOW.uvIndex }
  );
  if (rain) rows.push({ icon: "rain", label: "Rain", value: rain.value });
  rows.push({
    icon: "air",
    label: "Air quality",
    tag: SAMPLE_NOW.airQuality.level,
    value: `${SAMPLE_NOW.airQuality.index} AQI`,
  });
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

/** The issued chance of rain, or the sample for this day offset. */
export function rainChance(day: ForecastDayData, index: number): number | null {
  if (!isIssued(day)) return null;
  const issued = percent(find(day.conditions, RAIN_CHANCE)?.value);
  return issued ?? SAMPLE_DAYS[index]?.rainChance ?? null;
}

/**
 * A day's forecast items in reading order, paired for two columns: wind and
 * gusts, rain chance and amount, humidity and cloud, seas and swell, sunrise
 * and sunset, high and low tides, then visibility and air quality. Forecasts
 * carry no feels-like or UV. Issued values win; gaps take samples.
 */
export function dayReadings(day: ForecastDayData, index: number): Reading[] {
  if (!isIssued(day)) return [];
  const c = day.conditions;
  const sample = SAMPLE_DAYS[index] ?? SAMPLE_DAYS[0];
  const rows: Reading[] = [];

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

  const rain = rainChance(day, index);
  if (rain !== null)
    rows.push({ icon: "rain", label: "Chance of rain", value: `${rain}%` });
  rows.push(
    { icon: "rainfall", label: "Rainfall", value: sample.rainfall },
    { icon: "humidity", label: "Humidity", value: sample.humidity },
    { icon: "cloud", label: "Cloud cover", value: sample.cloudCover }
  );

  const waves = find(c, WAVE_HEIGHT);
  const sea = find(c, SEA_STATE);
  if (waves || sea)
    rows.push({
      detail: waves && sea ? sea.value : undefined,
      icon: "seas",
      label: "Seas",
      value: (waves ?? sea)?.value ?? "",
    });
  // FastAPI: value "1.4 m", label "Swell · NE every 9 s"; or the text alone.
  const swell = find(c, SWELL);
  rows.push(
    swell
      ? {
          detail: SWELL_DETAIL.test(swell.label)
            ? swell.label.replace(SWELL_DETAIL, "")
            : undefined,
          icon: "swell",
          label: "Swell",
          value: swell.value,
        }
      : {
          detail: sample.swell.detail,
          icon: "swell",
          label: "Swell",
          value: sample.swell.value,
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
    },
    {
      icon: "tide-high",
      label: "High tides",
      value: tideTimes(c, HIGH_TIDE) ?? sample.highTides,
    },
    {
      icon: "tide-low",
      label: "Low tides",
      value: tideTimes(c, LOW_TIDE) ?? sample.lowTides,
    },
    { icon: "visibility", label: "Visibility", value: sample.visibility },
    {
      icon: "air",
      label: "Air quality",
      tag: sample.airQuality.level,
      value: `${sample.airQuality.index} AQI`,
    }
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
