import type { ForecastPeriod, PublicForecast } from "@barrelsgd/api-client";
import type {
  Condition,
  ForecastDayData,
  WeatherSnapshot,
} from "@/lib/forecast-data";
import type { WeatherCondition } from "@/lib/weather-icons";

const PERIOD_TITLES: Record<string, string> = {
  morning: "Morning Forecast",
  midday: "Midday Forecast",
  evening: "Tonight",
};
const LOCAL_TEST_LABEL = /^LOCAL TEST\s+—\s*/u;
function conditionFor(summary: string): WeatherCondition {
  const text = summary.toLowerCase();
  if (text.includes("shower") || text.includes("rain")) return "showers";
  if (text.includes("partly")) return "partly-cloudy";
  if (text.includes("sunny") || text.includes("fair")) return "sunny";
  return "cloudy";
}
function conditions(period: ForecastPeriod): Condition[] {
  const v = period.details ?? {};
  const result: Condition[] = [
    {
      label: "Max Temp",
      value: period.high == null ? "Not supplied" : `${period.high}°C`,
    },
    {
      label: "Min Temp",
      value: period.low == null ? "Not supplied" : `${period.low}°C`,
    },
    { label: "Wind", value: v.wind || "Not supplied" },
    { label: "Sea State", value: v.seaState || "Not supplied" },
  ];
  for (const [label, key] of [
    ["High Tide", "highTides"],
    ["Low Tide", "lowTides"],
    ["Sunrise", "sunrise"],
    ["Sunset", "sunset"],
  ]) {
    if (v[key]) result.push({ label, value: v[key] });
  }
  if (!period.period_key && v.observedTemperature)
    result.push({
      label: "Midday observation at MBIA",
      value: `${v.observedTemperature}°C`,
    });
  return result;
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
  const summary = (period.details?.summary || "Not supplied").replace(
    LOCAL_TEST_LABEL,
    ""
  );
  return {
    date,
    high: period.high ?? null,
    low: period.low ?? null,
    conditions: conditions(period),
    title: period.period_key
      ? `Forecast for ${date}`
      : (PERIOD_TITLES[period.source.kind] ?? "Forecast"),
    condition: conditionFor(summary),
    summary,
    source: "",
  };
}
/** Presentation only: the API supplies selected periods and all time boundaries. */
export function weatherFromForecast(forecast: PublicForecast): WeatherSnapshot {
  const days = forecast.periods.map(periodData);
  const observed = forecast.observation;
  return {
    baseDate: forecast.base_date,
    days,
    observation: observed
      ? {
          temperature: observed.temperature,
          observedAt: `Reported ${new Intl.DateTimeFormat("en-GB", { timeZone: forecast.timezone ?? "America/Grenada", dateStyle: "medium", timeStyle: "short" }).format(new Date(observed.source.issued_at))} AST`,
        }
      : null,
    label: forecast.periods[0]?.source
      ? days[0].source
      : "Awaiting today’s morning forecast",
  };
}
/** Navigation placeholders during an outage; no forecast selection or sample weather. */
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
      source: "Unavailable",
    };
  });
  return {
    baseDate,
    days,
    observation: null,
    label: "Weather product information cannot be retrieved right now.",
  };
}
