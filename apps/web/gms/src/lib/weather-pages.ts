import type {
  PublicObservation,
  PublicPublishedProduct,
} from "@barrelsgd/api-client";
import {
  currentConditions,
  isStale,
  localTime,
} from "@/lib/current-conditions";
import type { ForecastDayData } from "@/lib/forecast-data";
import { UNAVAILABLE_SOURCE } from "@/lib/forecast-selection";

/** Placeholder for a value the source did not supply. */
export const NOT_SUPPLIED = "Not supplied";

const DAY_NAMES = ["Today", "Tomorrow"];

function degrees(value: number | null) {
  return value == null ? NOT_SUPPLIED : `${value} °C`;
}

function tileValue(day: ForecastDayData, ...labels: string[]) {
  const tile = day.conditions.find((item) =>
    labels.some((label) => item.label.startsWith(label))
  );
  return tile?.value;
}

function dayLabel(date: string, index: number) {
  return (
    DAY_NAMES[index] ??
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(`${date}T12:00:00Z`))
  );
}

/** True when the day has an issued forecast behind it. */
function isIssued(day: ForecastDayData) {
  return (
    day.source !== "Awaiting publication" && day.source !== UNAVAILABLE_SOURCE
  );
}

/**
 * Rows for the 3-day table from the first three backend-selected periods.
 * Days with no published forecast say so rather than showing blanks.
 */
export function threeDayRows(days: readonly ForecastDayData[]): string[][] {
  return days.slice(0, 3).map((day, index) => {
    const label = dayLabel(day.date, index);
    if (!isIssued(day))
      return [label, "No published forecast yet", "—", "—", "—", "—"];
    const wind = [
      tileValue(day, "Wind speed", "Wind"),
      tileValue(day, "Wind direction"),
    ]
      .filter(Boolean)
      .join(" ");
    return [
      label,
      day.summary,
      degrees(day.high),
      degrees(day.low),
      wind || NOT_SUPPLIED,
      tileValue(day, "Chance of rain") ?? NOT_SUPPLIED,
    ];
  });
}

/** Whether any of the first three periods carries an issued forecast. */
export function hasIssuedForecast(days: readonly ForecastDayData[]) {
  return days.slice(0, 3).some(isIssued);
}

export interface StationTile {
  detail?: string;
  label: string;
  value: string;
}

export interface StationReading {
  /** "Reported 16:00 AST", or "Last observed 11:00 AST" when stale. */
  observedAt: string;
  provisional: boolean;
  rows: string[][];
  stationName: string;
  tiles: StationTile[];
}

export const MBIA_NAME = "Maurice Bishop International Airport (MBIA)";

/** Public figures for the single register station; null when no reading. */
export function stationReading(
  observation: PublicObservation | null | undefined,
  now: Date = new Date()
): StationReading | null {
  if (!observation) return null;
  const c = currentConditions(observation);
  const find = (label: string) => c.primary.find((t) => t.label === label);
  const wind = find("Wind");
  const pressure = find("Pressure");
  const rain = c.extra.find((t) => t.label === "Rain, 24 h") ?? find("Rain");
  const humidity = c.humidity == null ? null : `${c.humidity}%`;
  const temperature = c.temperature == null ? null : `${c.temperature} °C`;
  const stationName = observation.station_name || MBIA_NAME;
  const tiles: StationTile[] = [];
  if (temperature)
    tiles.push({
      label: "Temperature",
      value: temperature,
      detail: c.dewPoint == null ? undefined : `Dew point ${c.dewPoint} °C`,
    });
  if (wind)
    tiles.push({ label: "Wind", value: wind.value, detail: wind.detail });
  if (humidity) tiles.push({ label: "Humidity", value: humidity });
  if (pressure)
    tiles.push({
      label: "Pressure",
      value: pressure.value,
      detail: pressure.detail,
    });
  if (rain)
    tiles.push({ label: rain.label, value: rain.value, detail: rain.detail });
  return {
    observedAt: `${isStale(c.observedAt, now) ? "Last observed" : "Reported"} ${localTime(c.observedAt)} AST`,
    provisional: c.provisional,
    stationName,
    tiles,
    rows: [
      [
        stationName,
        `${localTime(c.observedAt)} AST`,
        temperature ?? "—",
        humidity ?? "—",
        wind ? [wind.value, wind.detail].filter(Boolean).join(" · ") : "—",
        pressure?.value ?? "—",
        rain ? `${rain.value}${rain.detail ? ` (${rain.detail})` : ""}` : "—",
      ],
    ],
  };
}

export interface Synopsis {
  id: string;
  issuedAt: string;
  kindLabel: string;
  paragraphs: string[];
  publishedAt: string;
  watch: string[];
}

const FORECAST_KINDS = new Set(["morning", "midday", "evening"]);
const KIND_LABELS: Record<string, string> = {
  morning: "Morning Forecast",
  midday: "Midday Forecast",
  evening: "Evening Forecast",
};
const WATCH_KEYS = [
  "weatherAlert",
  "windAlert",
  "marineAlert",
  "weatherImpact",
  "windImpact",
  "marineImpact",
  "heatImpact",
  "dustImpact",
  "response",
] as const;

const PARAGRAPH_BREAK = /\r?\n\s*\r?\n/;

function paragraphsOf(text: string | undefined) {
  return (text ?? "")
    .split(PARAGRAPH_BREAK)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * The newest issued forecast's narrative. Its weather summary is the
 * forecaster's plain-language description; alerts, impacts and the overall
 * response fill "What to watch". GMS has no separate synopsis product kind.
 */
export function latestSynopsis(
  products: readonly PublicPublishedProduct[]
): Synopsis | null {
  const latest = [...products]
    .filter((p) => FORECAST_KINDS.has(p.kind) && p.values.summary?.trim())
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  if (!latest) return null;
  const v = latest.values;
  const watch = WATCH_KEYS.map((key) => v[key]?.trim()).filter(
    (text): text is string => Boolean(text)
  );
  return {
    id: latest.id,
    issuedAt: v.issuedAt ?? latest.publishedAt,
    kindLabel: KIND_LABELS[latest.kind] ?? "Forecast",
    paragraphs: paragraphsOf(v.summary),
    publishedAt: latest.publishedAt,
    watch: [...new Set(watch)],
  };
}
