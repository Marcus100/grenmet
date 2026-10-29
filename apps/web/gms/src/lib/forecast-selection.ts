import type { ForecastPeriod, PublicForecast } from "@barrelsgd/api-client";
import type {
  Condition,
  ForecastDayData,
  TodayIssue,
  WeatherSnapshot,
} from "@/lib/forecast-data";
import { DEFAULT_UNITS, formatMeasure, type Measure } from "@/lib/units";
import type { WeatherCondition } from "@/lib/weather-icons";

const ISSUE_LABELS: Record<string, string> = {
  morning: "Morning",
  midday: "Midday",
  evening: "Evening",
};
const PERIOD_TITLES: Record<string, string> = {
  morning: "Morning Forecast",
  midday: "Midday Forecast",
  evening: "Tonight",
};
function conditionFor(summary: string): WeatherCondition {
  const text = summary.toLowerCase();
  if (text.includes("shower") || text.includes("rain")) return "showers";
  if (text.includes("partly")) return "partly-cloudy";
  if (text.includes("sunny") || text.includes("fair")) return "sunny";
  return "cloudy";
}
/**
 * A temperature tile with its numbers, so the page can show it in the visitor's
 * unit system. `value` is the same text in the default (metric) units.
 */
function temperatureTile(label: string, low: number): Condition {
  const measure: Measure = { quantity: "temperature", low };
  return {
    label,
    measure,
    value: formatMeasure(measure, DEFAULT_UNITS) ?? "Not supplied",
  };
}

/** The midday temperature observed at MBIA, kept apart from the forecast maximum. */
function observationTile(observed: string | undefined): Condition | null {
  const value = observed ? Number(observed) : Number.NaN;
  return Number.isFinite(value)
    ? temperatureTile("Midday observation at MBIA", value)
    : null;
}

function conditions(period: ForecastPeriod): Condition[] {
  const v = period.details ?? {};
  // FastAPI formats structured wind, sea and tides (public units first); use it
  // when present so the site matches the issued PDF.
  if (period.conditions?.length) {
    const tiles: Condition[] = period.conditions.map(
      ({ icon, value, label, quantity, low, high }) => ({
        icon,
        value,
        label,
        ...(quantity && low !== null && low !== undefined
          ? { measure: { quantity, low, high: high ?? null } }
          : {}),
      })
    );
    const observation = observationTile(v.observedTemperature);
    if (!period.period_key && observation) tiles.push(observation);
    return tiles;
  }
  // Without structured tiles the feed sends only the forecaster's words for
  // wind and sea state, so those stay text (no numbers to convert).
  const result: Condition[] = [
    period.high == null
      ? { label: "Max Temp", value: "Not supplied" }
      : temperatureTile("Max Temp", period.high),
    period.low == null
      ? { label: "Min Temp", value: "Not supplied" }
      : temperatureTile("Min Temp", period.low),
    { label: "Wind", value: v.wind || "Not supplied" },
    { label: "Sea State", value: v.seaState || "Not supplied" },
  ];
  for (const [label, key] of [
    ["High Tide", "highTides"],
    ["Low Tide", "lowTides"],
    ["Sunrise", "sunrise"],
    ["Sunset", "sunset"],
  ] as const) {
    if (v[key]) result.push({ label, value: v[key] });
  }
  const observation = observationTile(v.observedTemperature);
  if (!period.period_key && observation) result.push(observation);
  return result;
}
/**
 * Today taken from an outlook day means today's own forecast is not out yet;
 * the API falls back to the newest evening issue and the title says which.
 */
function periodTitle(period: ForecastPeriod, index: number): string {
  if (!period.period_key)
    return PERIOD_TITLES[period.source?.kind ?? ""] ?? "Forecast";
  if (index > 0 || !period.source) return `Forecast for ${period.date}`;
  const issued = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Grenada",
    day: "numeric",
    month: "short",
  }).format(new Date(period.source.issued_at));
  const kind = ISSUE_LABELS[period.source.kind]?.toLowerCase() ?? "earlier";
  return `From the ${issued} ${kind} forecast`;
}
function periodData(period: ForecastPeriod, index: number): ForecastDayData {
  const date = period.date;
  if (!period.source) {
    const summary =
      index === 0
        ? "Awaiting today’s morning forecast"
        : "No published forecast is available for this date.";
    return {
      date,
      high: null,
      low: null,
      conditions: [],
      title: index === 0 ? summary : `Forecast for ${date}`,
      condition: "cloudy",
      summary,
      source: "Awaiting publication",
    };
  }
  const summary = period.details?.summary || "Not supplied";
  return {
    date,
    high: period.high ?? null,
    low: period.low ?? null,
    conditions: conditions(period),
    title: periodTitle(period, index),
    condition: conditionFor(summary),
    summary,
    source: "",
  };
}
/** Presentation only: the API supplies selected periods and all time boundaries. */
export function weatherFromForecast(forecast: PublicForecast): WeatherSnapshot {
  const days = forecast.periods.map(periodData);
  const observed = forecast.observation;
  const todayIssues: TodayIssue[] = (forecast.today_issues ?? []).flatMap(
    (issue) =>
      issue.source
        ? [
            {
              day: periodData(issue, 0),
              issuedAt: issue.source.issued_at,
              kind: issue.source.kind,
              label: ISSUE_LABELS[issue.source.kind] ?? "Forecast",
            },
          ]
        : []
  );
  return {
    baseDate: forecast.base_date,
    current: null,
    days,
    todayIssues,
    observation: observed
      ? {
          temperature: observed.temperature,
          observedAt: `Reported ${new Intl.DateTimeFormat("en-GB", { timeZone: forecast.timezone ?? "America/Grenada", dateStyle: "medium", timeStyle: "short" }).format(new Date(observed.source.issued_at))} AST`,
        }
      : null,
    label:
      (forecast.periods[0]?.source ? days[0]?.source : undefined) ??
      "Awaiting today’s morning forecast",
  };
}
/** Navigation placeholders during an outage; no forecast selection or sample weather. */
/** Marks the placeholder days built when no forecast can be retrieved. */
export const UNAVAILABLE_SOURCE = "Unavailable";

export function unavailableWeather(): WeatherSnapshot {
  const baseDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Grenada",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const days = Array.from({ length: 5 }, (_, index): ForecastDayData => {
    const date = new Date(`${baseDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      high: null,
      low: null,
      conditions: [],
      condition: "cloudy",
      title: "Forecast unavailable",
      summary: "Weather product information cannot be retrieved right now.",
      source: UNAVAILABLE_SOURCE,
    };
  });
  return {
    baseDate,
    days,
    current: null,
    observation: null,
    todayIssues: [],
    label: "Weather product information cannot be retrieved right now.",
  };
}
