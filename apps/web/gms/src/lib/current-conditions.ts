import type { PublicObservation } from "@barrelsgd/api-client";
import type { Condition } from "@/lib/forecast-data";
import { DEFAULT_UNITS, formatMeasure, type Measure } from "@/lib/units";

/**
 * Freshness limits from the Barrels foundations plan (NFRs). A product older
 * than its limit is labelled "Last ...", never as current.
 */
/** A reading older than this is labelled "Last observed", never "Observed". */
export const STALE_AFTER_MS = 90 * 60 * 1000;
/** A forecast issued longer ago than this is flagged as possibly out of date. */
export const FORECAST_STALE_AFTER_MS = 12 * 60 * 60 * 1000;
/** A satellite image older than this is flagged as not current. */
export const SATELLITE_STALE_AFTER_MS = 30 * 60 * 1000;

export interface CurrentConditions {
  dewPoint: number | null;
  /** Shown only in the "More readings" fold on phones. */
  extra: Condition[];
  /** Relative humidity, %; feeds the feels-like figure. */
  humidity: number | null;
  observedAt: string;
  /**
   * Size of the pressure change over three hours, hPa, when the observer
   * recorded a trend other than steady. A number, so each page can show it in
   * the visitor's unit system.
   */
  pressureChangeHpa: number | null;
  /** Pressure tendency over three hours, when the observer recorded one. */
  pressureTrend: "falling" | "rising" | "steady" | null;
  /** Four headline readings: wind, pressure, rain, humidity. */
  primary: Condition[];
  provisional: boolean;
  temperature: number | null;
  weather: string | null;
}

const TREND: Record<string, string> = {
  rising: "Rising",
  steady: "Steady",
  falling: "Falling",
};

/** A condition whose text is the default-unit rendering of its measure. */
function measured(
  tile: Omit<Condition, "measure" | "value">,
  measure: Measure
): Condition | null {
  const value = formatMeasure(measure, DEFAULT_UNITS);
  return value === null ? null : { ...tile, measure, value };
}

function wind(o: PublicObservation): Condition | null {
  if (o.wind_calm) return { icon: "wind", label: "Wind", value: "Calm" };
  if (o.wind_speed_kt == null) return null;
  // The speed is shown once, in the visitor's unit system; no knots repeat.
  return measured(
    { icon: "wind", label: "Wind" },
    {
      quantity: "speed",
      low: o.wind_speed_kt,
      prefix: o.wind_direction ? `${o.wind_direction} ` : undefined,
    }
  );
}

/** The three-hour change in hPa; the trend word carries its direction. */
function pressureChange(o: PublicObservation): number | null {
  if (o.pressure_change_hpa == null || o.pressure_trend === "steady") {
    return null;
  }
  return Math.abs(o.pressure_change_hpa);
}

function pressure(o: PublicObservation): Condition | null {
  if (o.msl_pressure_hpa == null) return null;
  const trend = o.pressure_trend ? TREND[o.pressure_trend] : null;
  return measured(
    {
      icon: "gauge",
      label: "Pressure",
      detail: trend ?? undefined,
    },
    { quantity: "pressure", low: o.msl_pressure_hpa }
  );
}

function rain(o: PublicObservation): Condition | null {
  if (o.rain_mm == null) return null;
  const tile = {
    icon: "umbrella",
    label: "Rain",
    detail: o.rain_period_hours ? `last ${o.rain_period_hours} h` : undefined,
  };
  return o.rain_trace
    ? { ...tile, value: "Trace" }
    : measured(tile, { quantity: "rain", low: o.rain_mm });
}

/** Whole metres for a cloud base band: "600–1000 m up", or "2500 m or higher". */
function cloudBase(o: PublicObservation): Condition | null {
  if (o.cloud_base_min_m == null) return null;
  const tile = { icon: "cloud", label: "Cloud base" };
  if (o.cloud_base_max_m == null) {
    return measured(
      { ...tile, detail: "or higher" },
      { quantity: "height", low: o.cloud_base_min_m, places: 0 }
    );
  }
  return measured(tile, {
    quantity: "height",
    low: o.cloud_base_min_m,
    high: o.cloud_base_max_m,
    places: 0,
  });
}

/** Public tiles for the latest register reading; missing values drop out. */
export function currentConditions(o: PublicObservation): CurrentConditions {
  const primary = [
    wind(o),
    pressure(o),
    rain(o),
    o.relative_humidity == null
      ? null
      : {
          icon: "droplets",
          label: "Humidity",
          value: `${o.relative_humidity}%`,
        },
  ].filter((tile): tile is Condition => tile !== null);
  const extra: Condition[] = [];
  if (o.cloud) extra.push({ icon: "cloud", label: "Cloud", value: o.cloud });
  for (const tile of [
    o.rain_24h_mm == null
      ? null
      : measured(
          { icon: "umbrella", label: "Rain, 24 h" },
          { quantity: "rain", low: o.rain_24h_mm }
        ),
    o.wind_gust_kt == null
      ? null
      : measured(
          { icon: "wind", label: "Gusts" },
          { quantity: "speed", low: o.wind_gust_kt }
        ),
    o.visibility_km == null
      ? null
      : measured(
          { icon: "eye", label: "Visibility" },
          { quantity: "distance", low: o.visibility_km }
        ),
    cloudBase(o),
    o.max_temperature_c == null
      ? null
      : measured(
          { icon: "thermometer-sun", label: "Highest today" },
          { quantity: "temperature", low: o.max_temperature_c, places: 0 }
        ),
    o.min_temperature_c == null
      ? null
      : measured(
          { icon: "thermometer-snowflake", label: "Lowest today" },
          { quantity: "temperature", low: o.min_temperature_c, places: 0 }
        ),
  ])
    if (tile) extra.push(tile);
  return {
    dewPoint: o.dew_point_c ?? null,
    extra,
    humidity: o.relative_humidity ?? null,
    observedAt: o.observed_at,
    pressureChangeHpa: pressureChange(o),
    pressureTrend: o.pressure_trend ?? null,
    primary,
    provisional: o.status !== "accepted",
    temperature: o.temperature_c ?? null,
    weather: o.weather ?? null,
  };
}

/** "13:00" in Grenada time. */
export function localTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Grenada",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(parseGrenadaTime(iso)));
}

/** "18 Oct, 13:00 AST": a date and time in Grenada time. */
export function localDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Grenada",
    day: "numeric",
    month: "short",
  }).format(new Date(parseGrenadaTime(iso)));
  return `${parts}, ${localTime(iso)} AST`;
}

/** "18 Oct": the calendar day of an ISO time, in Grenada time. */
export function localDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Grenada",
    day: "numeric",
    month: "short",
  }).format(new Date(parseGrenadaTime(iso)));
}

/** "Wed": the weekday of an ISO time, in Grenada time. */
export function localWeekday(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Grenada",
    weekday: "short",
  }).format(new Date(parseGrenadaTime(iso)));
}

const GRENADA_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Grenada",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** True when `iso` falls on a different Grenada calendar day than `now`. */
export function isOtherGrenadaDay(
  iso: string,
  now: Date = new Date()
): boolean {
  const time = parseGrenadaTime(iso);
  if (Number.isNaN(time)) {
    return true;
  }
  return GRENADA_DAY.format(time) !== GRENADA_DAY.format(now);
}

const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function olderThan(iso: string, limitMs: number, now: Date): boolean {
  const time = parseGrenadaTime(iso);
  // An unreadable time is never presented as fresh.
  return Number.isNaN(time) || now.getTime() - time > limitMs;
}

/**
 * Milliseconds for an ISO time. GMS forms store Grenada wall-clock times with
 * no offset ("2026-10-18T06:00"); Grenada is UTC-4 all year, so read those as AST.
 */
export function parseGrenadaTime(iso: string): number {
  const hasZone = HAS_ZONE.test(iso);
  return new Date(hasZone ? iso : `${iso}-04:00`).getTime();
}

export function isStale(iso: string, now: Date = new Date()): boolean {
  return olderThan(iso, STALE_AFTER_MS, now);
}

export function isForecastStale(iso: string, now: Date = new Date()): boolean {
  return olderThan(iso, FORECAST_STALE_AFTER_MS, now);
}

export function isSatelliteStale(iso: string, now: Date = new Date()): boolean {
  return olderThan(iso, SATELLITE_STALE_AFTER_MS, now);
}
