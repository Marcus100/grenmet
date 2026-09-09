import {
  followingDate,
  grenadaDate,
  type PublishedProduct,
} from "@barrelsgd/gms/products";
import type { WeatherCondition } from "@/lib/weather-icons";
export interface Condition {
  label: string;
  value: string;
}
export interface DayForecast {
  condition: WeatherCondition;
  high: number | null;
  low: number | null;
}
export interface ForecastDayData extends DayForecast {
  conditions: Condition[];
  date: string;
  source: string;
  summary: string;
}
export interface WeatherSnapshot {
  baseDate: string;
  days: ForecastDayData[];
  label: string;
  observation: { temperature: number; observedAt: string } | null;
}
export const REFERENCE_DATE = "2026-09-08";
function conditions(
  high: string,
  low: string,
  wind: string,
  seas: string,
  sunrise: string,
  sunset: string
): Condition[] {
  return [
    { label: "Max Temp", value: high },
    { label: "Min Temp", value: low },
    { label: "Wind", value: wind },
    { label: "Sea State", value: seas },
    { label: "Sunrise", value: sunrise },
    { label: "Sunset", value: sunset },
  ];
}
export const REFERENCE_WEATHER: WeatherSnapshot = {
  baseDate: REFERENCE_DATE,
  label:
    "Supplied GMS reports · 8 September 2026 · Evening issue 6 p.m. AST. Not a live observation feed.",
  observation: {
    temperature: 31.9,
    observedAt: "8 September 2026, 12:00 p.m. AST",
  },
  days: [
    {
      date: "2026-09-08",
      condition: "showers",
      high: 32.5,
      low: 24.5,
      source: "Midday temperatures; evening conditions · 8 September",
      summary:
        "Tonight: partly cloudy to cloudy with showers, heavy at times, and isolated thunder. Low chance of flash flooding; Small Craft Advisory in the evening report.",
      conditions: [
        ...conditions(
          "32.5°C",
          "24.5°C",
          "ENE–ESE, 12–22 mph; gustier in showers",
          "Moderate; waves 5–7 ft in open water",
          "5:56 a.m.",
          "6:12 p.m."
        ),
        { label: "High Tide", value: "2:15 p.m. (midday report)" },
        { label: "Low Tide", value: "6:00 p.m. (midday report)" },
      ],
    },
    {
      date: "2026-09-09",
      condition: "showers",
      high: 31.5,
      low: 24.5,
      source: "8 September evening report",
      summary:
        "Partly cloudy to cloudy and windy, with light to moderate showers and possible isolated thunder.",
      conditions: conditions(
        "31.5°C",
        "24.5°C",
        "ENE–ESE, 14–24 mph; gustier in showers",
        "Moderate; waves 5–7 ft; NE–E swells",
        "5:56 a.m.",
        "6:12 p.m."
      ),
    },
    {
      date: "2026-09-10",
      condition: "showers",
      high: 31,
      low: 24.5,
      source: "8 September evening report",
      summary:
        "Partly cloudy to cloudy and breezy, with light to moderate showers and possible isolated thunder. Small Craft Advisory in this outlook.",
      conditions: conditions(
        "31.0°C",
        "24.5°C",
        "ENE–ESE, 13–23 mph; higher gusts at times",
        "Moderate; waves 5–7 ft in open water",
        "5:56 a.m.",
        "6:11 p.m."
      ),
    },
    {
      date: "2026-09-11",
      condition: "partly-cloudy",
      high: 32.5,
      low: 24.5,
      source: "8 September evening report",
      summary:
        "Partly cloudy and breezy with brief, light to moderate showers.",
      conditions: conditions(
        "32.5°C",
        "24.5°C",
        "ENE–ESE, 13–23 mph",
        "Moderate; waves 4–6 ft in open water",
        "5:56 a.m.",
        "6:10 p.m."
      ),
    },
    {
      date: "2026-09-12",
      condition: "cloudy",
      high: null,
      low: null,
      source: "No fourth-day values supplied",
      summary:
        "The new evening form supports this fourth day. The supplied report does not contain its forecast.",
      conditions: [
        {
          label: "Forecast",
          value: "No issued data supplied for 12 September",
        },
      ],
    },
  ],
};
export const DAY_FORECASTS = REFERENCE_WEATHER.days;
export const DAY_CONDITIONS = REFERENCE_WEATHER.days.map(
  (day) => day.conditions
);
export const TODAY_CONDITIONS = DAY_CONDITIONS[0];
function number(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function conditionFor(summary: string): WeatherCondition {
  const text = summary.toLowerCase();
  if (text.includes("shower") || text.includes("rain")) return "showers";
  if (text.includes("partly")) return "partly-cloudy";
  if (text.includes("sunny") || text.includes("fair")) return "sunny";
  return "cloudy";
}
export function weatherFromProducts(
  products: PublishedProduct[],
  now = Date.now()
): WeatherSnapshot {
  const baseDate = grenadaDate(now);
  const forecasts = products
    .filter((p) => ["morning", "midday", "evening"].includes(p.kind))
    .sort((a, b) => b.values.issuedAt.localeCompare(a.values.issuedAt));
  const days = Array.from({ length: 5 }, (_, index) => {
    const date = followingDate(baseDate, index);
    for (const product of forecasts) {
      const v = product.values;
      const offset = Array.from({ length: 4 }, (_, i) => i + 1).find(
        (i) => v[`day${i}Date`] === date
      );
      const sameDay = v.issuedAt.startsWith(date);
      if (!sameDay && (product.kind !== "evening" || !offset)) continue;
      const prefix = sameDay ? "" : `day${offset}`;
      const summary = (prefix ? v[`${prefix}Weather`] : v.summary) || "";
      const high = number(prefix ? v[`${prefix}Max`] : v.maxTemperature),
        low = number(prefix ? v[`${prefix}Min`] : v.minTemperature);
      const rows: Condition[] = [
        {
          label: "Max Temp",
          value: high === null ? "Not supplied" : `${high}°C`,
        },
        {
          label: "Min Temp",
          value: low === null ? "Not supplied" : `${low}°C`,
        },
        {
          label: "Wind",
          value: (prefix ? v[`${prefix}Wind`] : v.wind) || "Not supplied",
        },
        {
          label: "Sea State",
          value:
            (prefix ? v[`${prefix}SeaState`] : v.seaState) || "Not supplied",
        },
      ];
      return {
        date,
        condition: conditionFor(summary),
        high,
        low,
        summary,
        conditions: rows,
        source: `${product.kind} forecast · ${v.issuedAt.replace("T", " ")} AST`,
      };
    }
    return {
      date,
      condition: "cloudy" as const,
      high: null,
      low: null,
      summary: "No current issued forecast is available for this date.",
      conditions: [{ label: "Forecast", value: "Not available" }],
      source: "No current issued forecast",
    };
  });
  const observed = forecasts.find(
    (p) =>
      p.kind === "midday" &&
      p.values.issuedAt.startsWith(baseDate) &&
      number(p.values.observedTemperature) !== null
  );
  const observation = observed
    ? {
        temperature: Number(observed.values.observedTemperature),
        observedAt: `${observed.values.issuedAt.replace("T", " ")} AST`,
      }
    : null;
  return {
    baseDate,
    days,
    observation,
    label: forecasts[0]
      ? `Latest issue: ${forecasts[0].values.issuedAt.replace("T", " ")} AST. Morning 07:00 · Midday 12:00 · Evening 18:00.`
      : "Current forecast information is not available.",
  };
}
