import type { PublicObservation } from "@barrelsgd/api-client";
import type { Condition } from "@/lib/forecast-data";

/** A reading older than this is labelled "Last observed", never "Observed". */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

export interface CurrentConditions {
  dewPoint: number | null;
  /** Shown only in the "More readings" fold on phones. */
  extra: Condition[];
  /** Relative humidity, %; feeds the feels-like figure. */
  humidity: number | null;
  observedAt: string;
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

function wind(o: PublicObservation): Condition | null {
  if (o.wind_calm) return { icon: "wind", label: "Wind", value: "Calm" };
  if (o.wind_speed_mph == null) return null;
  return {
    icon: "wind",
    label: "Wind",
    value: [o.wind_direction, `${o.wind_speed_mph} mph`]
      .filter(Boolean)
      .join(" "),
    detail: `${o.wind_speed_kt} kt`,
  };
}

function pressure(o: PublicObservation): Condition | null {
  if (o.msl_pressure_hpa == null) return null;
  const trend = o.pressure_trend ? TREND[o.pressure_trend] : null;
  const change =
    o.pressure_change_hpa != null && o.pressure_trend !== "steady"
      ? ` ${o.pressure_change_hpa} in 3 h`
      : "";
  return {
    icon: "gauge",
    label: "Pressure",
    value: `${o.msl_pressure_hpa.toFixed(1)} hPa`,
    detail: trend ? `${trend}${change}` : undefined,
  };
}

function rain(o: PublicObservation): Condition | null {
  if (o.rain_mm == null) return null;
  return {
    icon: "umbrella",
    label: "Rain",
    value: o.rain_trace ? "Trace" : `${o.rain_mm} mm`,
    detail: o.rain_period_hours ? `last ${o.rain_period_hours} h` : undefined,
  };
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
  if (o.rain_24h_mm != null)
    extra.push({
      icon: "umbrella",
      label: "Rain, 24 h",
      value: `${o.rain_24h_mm} mm`,
    });
  return {
    dewPoint: o.dew_point_c ?? null,
    extra,
    humidity: o.relative_humidity ?? null,
    observedAt: o.observed_at,
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
  }).format(new Date(iso));
}

export function isStale(iso: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(iso).getTime() > STALE_AFTER_MS;
}
