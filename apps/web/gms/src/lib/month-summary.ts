import type { PublicMonthSummary } from "@barrelsgd/api-client";

export interface MonthStat {
  detail: string;
  label: string;
  unit: string;
  /** null when the register has not reported it; shown as a dash, never 0. */
  value: string | null;
}

export interface MonthStats {
  /** Time of the newest register reading behind the figures (ISO). */
  lastObservationAt: string;
  provisional: boolean;
  stats: MonthStat[];
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

/**
 * Month-to-date figures for the homepage, straight from the register
 * summary. Unreported figures stay null so the card says so instead of
 * showing a made-up number.
 */
export function monthStats(summary: PublicMonthSummary): MonthStats {
  const station = summary.station_name || "MBIA";
  return {
    lastObservationAt: summary.last_observation_at,
    provisional: summary.provisional,
    stats: [
      {
        label: `Rainfall this month · ${station}`,
        value: summary.rainfall_mm == null ? null : String(summary.rainfall_mm),
        unit: "mm",
        detail: `${summary.rain_report_days} of ${summary.days_elapsed} days reported`,
      },
      {
        label: `Highest temperature · ${station}`,
        value: text(summary.max_temperature_c, 1),
        unit: "°C",
        detail: on(summary.max_temperature_at),
      },
      {
        label: `Lowest temperature · ${station}`,
        value: text(summary.min_temperature_c, 1),
        unit: "°C",
        detail: on(summary.min_temperature_at),
      },
      {
        label: `Rain days · ${station}`,
        value: summary.rain_days == null ? null : String(summary.rain_days),
        unit: summary.rain_days === 1 ? "day" : "days",
        detail: `with ${summary.rain_day_threshold_mm} mm or more`,
      },
    ],
  };
}
