import type { PublicMonthSummary } from "@barrelsgd/api-client";
import type { Quantity } from "@/lib/units";

export interface MonthStat {
  detail: string;
  label: string;
  /** The number behind `value` (WMO unit), so the card follows the unit switch. */
  measure?: { quantity: Quantity; value: number | null };
  unit: string;
  /** null when the register has not reported it; shown as a dash, never 0. */
  value: string | null;
}

export type MonthGroupKey = "rain" | "temperature" | "wind" | "dry";

export interface MonthGroup {
  key: MonthGroupKey;
  name: string;
  stats: [MonthStat, MonthStat];
}

export interface MonthStats {
  groups: MonthGroup[];
  /** Time of the newest register reading behind the figures (ISO). */
  lastObservationAt: string;
  provisional: boolean;
  station: string;
}

const day = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Grenada",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));

/** "on 3 October", or a plain note when the register has no such reading. */
const on = (iso: string | null | undefined) =>
  iso ? `on ${day(iso)}` : "Not reported yet";

const text = (value: number | null | undefined, digits?: number) =>
  value == null ? null : value.toFixed(digits);

const count = (value: number | null | undefined) =>
  value == null ? null : String(value);

const days = (value: number | null | undefined) =>
  value === 1 ? "day" : "days";

/** A plain calendar date (YYYY-MM-DD) as "3 October". */
const calendarDay = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  }).format(new Date(`${value}T12:00:00Z`));

const POINT_WORDS: Record<string, string> = {
  N: "north",
  NE: "north-east",
  E: "east",
  SE: "south-east",
  S: "south",
  SW: "south-west",
  W: "west",
  NW: "north-west",
};

/**
 * Month figures for the homepage as four cards, one per weather parameter
 * (owner, 1 Nov 2026): rainfall, temperature, wind and dry spells, straight
 * from the register summary. Unreported figures stay null so the card says
 * so instead of showing a made-up number. No 1991-2020 normals yet: the
 * comparison line waits for GMS's normals.
 */
export function monthStats(summary: PublicMonthSummary): MonthStats {
  const longest = summary.longest_dry_spell_days ?? null;
  const spell =
    summary.longest_dry_spell_start && summary.longest_dry_spell_end
      ? summary.longest_dry_spell_start === summary.longest_dry_spell_end
        ? calendarDay(summary.longest_dry_spell_start)
        : `${calendarDay(summary.longest_dry_spell_start)} to ${calendarDay(summary.longest_dry_spell_end)}`
      : "Not reported yet";
  const current = summary.current_dry_spell_days ?? null;
  const point = summary.prevailing_wind_direction ?? null;
  return {
    station: summary.station_name || "MBIA",
    lastObservationAt: summary.last_observation_at,
    provisional: summary.provisional,
    groups: [
      {
        key: "rain",
        name: "Rainfall",
        stats: [
          {
            label: "Total so far",
            measure: { quantity: "rain", value: summary.rainfall_mm ?? null },
            value:
              summary.rainfall_mm == null ? null : String(summary.rainfall_mm),
            unit: "mm",
            detail: `${summary.rain_report_days} of ${summary.days_elapsed} days reported`,
          },
          {
            label: "Heavy rain days",
            value: count(summary.heavy_rain_days),
            unit: days(summary.heavy_rain_days),
            detail: `with ${summary.heavy_rain_threshold_mm ?? 10} mm or more`,
          },
        ],
      },
      {
        key: "temperature",
        name: "Temperature",
        stats: [
          {
            label: "Hottest",
            measure: {
              quantity: "temperature",
              value: summary.max_temperature_c ?? null,
            },
            value: text(summary.max_temperature_c, 1),
            unit: "°C",
            detail: on(summary.max_temperature_at),
          },
          {
            label: "Coolest",
            measure: {
              quantity: "temperature",
              value: summary.min_temperature_c ?? null,
            },
            value: text(summary.min_temperature_c, 1),
            unit: "°C",
            detail: on(summary.min_temperature_at),
          },
        ],
      },
      {
        key: "wind",
        name: "Wind",
        stats: [
          {
            label: "Average wind",
            measure: { quantity: "speed", value: summary.mean_wind_kt ?? null },
            value: text(summary.mean_wind_kt, 0),
            unit: "kn",
            detail: point
              ? `Mostly from the ${POINT_WORDS[point] ?? point}`
              : "Direction not reported yet",
          },
          {
            label: "Strongest gust",
            measure: { quantity: "speed", value: summary.max_gust_kt ?? null },
            value: count(summary.max_gust_kt),
            unit: "kn",
            detail: on(summary.max_gust_at),
          },
        ],
      },
      {
        key: "dry",
        name: "Dry spells",
        stats: [
          {
            label: "Longest dry spell",
            value: count(longest),
            unit: days(longest),
            detail: spell,
          },
          {
            label: "Current dry spell",
            value: count(current),
            unit: days(current),
            detail:
              current === 0
                ? "It rained on the latest day"
                : `under ${summary.dry_day_threshold_mm ?? 1} mm a day`,
          },
        ],
      },
    ],
  };
}

/**
 * Which month the homepage shows: the month so far from the 5th, before that
 * the previous month in full (owner, 1 Nov 2026). Grenada dates; `month` is
 * the API's YYYY-MM.
 */
export function dataMonth(now = new Date()): {
  label: string;
  month: string;
  previous: boolean;
} {
  const local = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const previous = local.getUTCDate() < 5;
  const year = local.getUTCFullYear();
  const index = local.getUTCMonth() - (previous ? 1 : 0);
  const shown = new Date(Date.UTC(year, index, 15));
  const month = shown.toISOString().slice(0, 7);
  const name = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(shown);
  return {
    month,
    previous,
    label: previous ? `${name} at MBIA` : `${name} so far at MBIA`,
  };
}
