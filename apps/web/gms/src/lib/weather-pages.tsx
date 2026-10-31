import type {
  PublicObservation,
  PublicPublishedProduct,
} from "@barrelsgd/api-client";
import type { ReactNode } from "react";
import { Measure } from "@/components/measure";
import {
  currentConditions,
  isStale,
  localTime,
} from "@/lib/current-conditions";
import type { Condition, ForecastDayData } from "@/lib/forecast-data";
import { UNAVAILABLE_SOURCE } from "@/lib/forecast-selection";
import { reportError } from "@/lib/report-error";
import { isAllClear } from "@/lib/sector-outlook";
import { bothUnits } from "@/lib/units";

/** Placeholder for a value the source did not supply. */
export const NOT_SUPPLIED = "Not supplied";

const DAY_NAMES = ["Today", "Tomorrow"];

const WIND_SPEED_TILE = /^wind speed|^wind$/i;
const WIND_DIRECTION_TILE = /^wind direction/i;
const CHANCE_OF_RAIN_TILE = /^chance of rain/i;

/** A whole-degree forecast temperature in the visitor's unit system. */
function degrees(value: number | null): ReactNode {
  if (value == null) return NOT_SUPPLIED;
  return (
    <Measure measure={{ low: value, places: 0, quantity: "temperature" }} />
  );
}

/** A figure in the visitor's unit system when it has numbers; otherwise its text. */
function figureOf(tile: Condition): ReactNode {
  if (tile.measure && bothUnits(tile.measure)) {
    return <Measure measure={tile.measure} />;
  }
  return tile.value;
}

function tileOf(day: ForecastDayData, pattern: RegExp) {
  return day.conditions.find((item) => pattern.test(item.label));
}

/** Direction and speed as one wind figure, e.g. "ENE 16 mph" in imperial. */
function windOf(day: ForecastDayData): ReactNode {
  const speed = tileOf(day, WIND_SPEED_TILE);
  const direction = tileOf(day, WIND_DIRECTION_TILE)?.value;
  if (speed?.measure && bothUnits(speed.measure)) {
    return (
      <Measure
        measure={{
          ...speed.measure,
          prefix: direction ? `${direction} ` : undefined,
        }}
      />
    );
  }
  return [direction, speed?.value].filter(Boolean).join(" ") || NOT_SUPPLIED;
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
export function threeDayRows(days: readonly ForecastDayData[]): ReactNode[][] {
  return days.slice(0, 3).map((day, index) => {
    const label = dayLabel(day.date, index);
    if (!isIssued(day))
      return [label, "No published forecast yet", "—", "—", "—", "—"];
    return [
      label,
      day.summary,
      degrees(day.high),
      degrees(day.low),
      windOf(day),
      tileOf(day, CHANCE_OF_RAIN_TILE)?.value ?? NOT_SUPPLIED,
    ];
  });
}

/** Whether any of the first three periods carries an issued forecast. */
export function hasIssuedForecast(days: readonly ForecastDayData[]) {
  return days.slice(0, 3).some(isIssued);
}

export interface StationTile {
  detail?: ReactNode;
  label: string;
  /** Text, or a `Measure` that follows the unit switch. */
  value: ReactNode;
}

export interface StationReading {
  /** "Reported 16:00 AST", or "Last observed 11:00 AST" when stale. */
  observedAt: string;
  /** The reading's own time (ISO), for the provenance line. */
  observedAtIso: string;
  provisional: boolean;
  rows: ReactNode[][];
  stationName: string;
  tiles: StationTile[];
}

/** Rain in the table: its amount, then the period in brackets when given. */
function rainCell(tile: Condition | undefined): ReactNode {
  if (!tile) return "—";
  if (!tile.detail) return figureOf(tile);
  return (
    <>
      {figureOf(tile)} ({tile.detail})
    </>
  );
}

/** "Rising 0.8 hPa in 3 h": the trend word and the size of its change. */
function pressureNote(
  trend: string | undefined,
  changeHpa: number | null
): ReactNode {
  if (!trend) return undefined;
  if (changeHpa === null) return trend;
  return (
    <>
      {trend} <Measure measure={{ low: changeHpa, quantity: "pressure" }} /> in
      3 h
    </>
  );
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
  const temperature =
    c.temperature == null ? null : (
      <Measure measure={{ low: c.temperature, quantity: "temperature" }} />
    );
  const dewPoint =
    c.dewPoint == null ? undefined : (
      <>
        Dew point{" "}
        <Measure measure={{ low: c.dewPoint, quantity: "temperature" }} />
      </>
    );
  const pressureDetail = pressureNote(pressure?.detail, c.pressureChangeHpa);
  const stationName = observation.station_name || MBIA_NAME;
  const tiles: StationTile[] = [];
  if (temperature)
    tiles.push({ label: "Temperature", value: temperature, detail: dewPoint });
  if (wind) tiles.push({ label: "Wind", value: figureOf(wind) });
  if (humidity) tiles.push({ label: "Humidity", value: humidity });
  if (pressure)
    tiles.push({
      label: "Pressure",
      value: figureOf(pressure),
      detail: pressureDetail,
    });
  if (rain)
    tiles.push({
      label: rain.label,
      value: figureOf(rain),
      detail: rain.detail,
    });
  return {
    observedAtIso: c.observedAt,
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
        wind ? figureOf(wind) : "—",
        pressure ? figureOf(pressure) : "—",
        rainCell(rain),
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
/** Typed watch text on forecasts issued before alerts were imported. */
const LEGACY_WATCH_KEYS = [
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

const ALERTS_UNCONFIRMED =
  "Weather alerts could not be fully confirmed when this forecast was issued.";

const PARAGRAPH_BREAK = /\r?\n\s*\r?\n/;

/**
 * GMS alerts and CAP warnings in force when the forecast was issued (the
 * `advisories` snapshot FastAPI copies into each forecast). Forecasters no
 * longer type impacts; alerts and CAP are the source. `null` when the
 * forecast predates the snapshot or it cannot be read.
 */
function importedWatch(raw: string | undefined): string[] | null {
  if (!raw?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    reportError(error, "weather-synopsis");
    return null;
  }
  const items =
    parsed && typeof parsed === "object" && "items" in parsed
      ? (parsed as { items: unknown }).items
      : null;
  if (!Array.isArray(items)) return null;
  const complete =
    !!parsed &&
    typeof parsed === "object" &&
    (parsed as { complete?: unknown }).complete !== false;
  const entries = items.flatMap(watchEntry);
  // An All clear is information, not an alert in force (owner decision, 30 Oct
  // 2026): it follows the alerts as "All clear: <title>", as on the alerts page.
  const listed = [
    ...entries.filter((entry) => !entry.allClear),
    ...entries.filter((entry) => entry.allClear),
  ].map((entry) => entry.line);
  // A source that could not be read is not "nothing in force": say so.
  return complete ? listed : [...listed, ALERTS_UNCONFIRMED];
}

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/** One snapshot item as a "What to watch" line, or nothing when it has no words. */
function watchEntry(item: unknown): { allClear: boolean; line: string }[] {
  if (!item || typeof item !== "object") return [];
  const { colour, impacts, noticeType, title } = item as Record<
    string,
    unknown
  >;
  const name = text(title);
  const detail = text(impacts);
  if (
    name &&
    isAllClear({ colour: text(colour), notice_type: text(noticeType) })
  ) {
    return [{ allClear: true, line: `All clear: ${name}` }];
  }
  if (!name) return detail ? [{ allClear: false, line: detail }] : [];
  return [{ allClear: false, line: detail ? `${name}: ${detail}` : name }];
}

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
  const watch =
    importedWatch(v.advisories) ??
    LEGACY_WATCH_KEYS.map((key) => v[key]?.trim()).filter(
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
