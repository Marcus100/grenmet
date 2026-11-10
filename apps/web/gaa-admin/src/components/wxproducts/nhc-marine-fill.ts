import type { NhcMarinePeriod } from "@barrelsgd/api-client";
import type { ProductField, ProductValues } from "@barrelsgd/gms/products";

/** Exact: 1 ft = 0.3048 m. Storage stays knots and metres (FastAPI `units.py`). */
const METRES_PER_FOOT = 0.3048;

function metres(feet: number): string {
  return String(Number((feet * METRES_PER_FOOT).toFixed(2)));
}

/** Canonical values (knots and metres) proposed by one NHC period, keyed by field. */
export function nhcPeriodValues(period: NhcMarinePeriod): ProductValues {
  const values: ProductValues = {};
  if (period.wind_direction_from)
    values.windDirFrom = period.wind_direction_from;
  if (period.wind_direction_to) values.windDirTo = period.wind_direction_to;
  if (period.wind_min_kt != null)
    values.windSpeedMin = String(period.wind_min_kt);
  if (period.wind_max_kt != null)
    values.windSpeedMax = String(period.wind_max_kt);
  if (period.gust_kt != null) values.windGust = String(period.gust_kt);
  if (period.sea_min_ft != null)
    values.waveHeightMin = metres(period.sea_min_ft);
  if (period.sea_max_ft != null)
    values.waveHeightMax = metres(period.sea_max_ft);
  return values;
}

export interface NhcFillResult {
  /** Keys of the fields that were filled. */
  filled: string[];
  patch: ProductValues;
}

/**
 * `fields` are the product's `fillFrom: "nhc"` fields (`fillableFields`). Only
 * empty fields are filled: a value the forecaster typed, or one already saved
 * in the draft, is never overwritten, and NHC wording never clears one.
 */
export function nhcFillValues(
  values: ProductValues,
  period: NhcMarinePeriod | undefined,
  fields: readonly ProductField[]
): NhcFillResult {
  const patch: ProductValues = {};
  const filled: string[] = [];
  if (!period) return { patch, filled };
  const proposed = nhcPeriodValues(period);
  for (const field of fields) {
    const value = proposed[field.key];
    if (value === undefined || value === "") continue;
    if ((values[field.key] ?? "").trim() !== "") continue;
    patch[field.key] = value;
    filled.push(field.key);
  }
  return { patch, filled };
}

function range(
  low: number | null | undefined,
  high: number | null | undefined,
  unit: string
): string {
  if (low == null && high == null) return "";
  if (low == null || high == null || low === high)
    return `${low ?? high} ${unit}`;
  return `${low} to ${high} ${unit}`;
}

/** Read-only summary of one NHC period, in the units NHC states plus metres. */
export function nhcPeriodSummary(period: NhcMarinePeriod): string {
  const direction = [period.wind_direction_from, period.wind_direction_to]
    .filter(Boolean)
    .join(" to ");
  const speed = range(period.wind_min_kt, period.wind_max_kt, "kt");
  const wind = speed ? `${direction} winds ${speed}`.trim() : "";
  const gust =
    period.gust_kt == null ? undefined : `gusts ${period.gust_kt} kt`;
  const feet = range(period.sea_min_ft, period.sea_max_ft, "ft");
  const sea =
    feet && period.sea_min_ft != null && period.sea_max_ft != null
      ? `Seas ${feet} (${range(
          Number((period.sea_min_ft * METRES_PER_FOOT).toFixed(2)),
          Number((period.sea_max_ft * METRES_PER_FOOT).toFixed(2)),
          "m"
        )})`
      : "";
  return [wind, gust, sea, (period.weather ?? []).join(", ")]
    .filter((part) => part !== undefined && part !== "")
    .join(". ");
}

/** "9 Nov 2026, 19:52 UTC" for an NHC issue time; never a guessed time. */
export function formatNhcIssue(iso: string | null | undefined): string {
  if (!iso) return "time unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "time unknown";
  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
  return `${formatted} UTC`;
}
