import {
  DAY_FORECASTS,
  type DayForecast,
  REFERENCE_DATE,
} from "@/lib/forecast-data";
import type { WeatherCondition } from "@/lib/weather-icons";

export interface ForecastDay {
  condition: WeatherCondition;
  date: number;
  dayName: string;
  high: number | null;
  isToday: boolean;
  low: number | null;
  month: string;
  /** `/weather/YYYY/MM/DD` — the dated forecast route for this day. */
  path: string;
  slug: string; // YYYY-MM-DD, the key used to look up the day's component
}

export function getForecastDays(
  baseDate = REFERENCE_DATE,
  forecasts: DayForecast[] = DAY_FORECASTS
): ForecastDay[] {
  const today = new Date(`${baseDate}T12:00:00Z`);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const forecast = forecasts[i];
    if (!forecast) {
      throw new Error(`Missing forecast for day ${i}`);
    }
    const slug = d.toISOString().slice(0, 10);
    return {
      condition: forecast.condition,
      date: d.getDate(),
      dayName: d.toLocaleString("en-US", { weekday: "short" }),
      high: forecast.high,
      isToday: i === 0,
      low: forecast.low,
      month: d.toLocaleString("en-US", { month: "short" }),
      path: `/weather/${slug.replace(/-/g, "/")}`,
      slug,
    };
  });
}

export function getUpcomingDaySlugs(): string[] {
  return getForecastDays()
    .slice(1)
    .map((d) => d.slug);
}

/** Browser title for a dated forecast: "Forecast for Friday 23 October 2026". */
export function forecastDayTitle(slug: string): string {
  const day = new Date(`${slug}T12:00:00Z`);
  // The date parser rolls impossible days forward (2026-02-31 becomes 3 March):
  // only a slug that round-trips is a real day.
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== slug) {
    return "Forecast";
  }
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(day);
  return `Forecast for ${date}`;
}

/** Splits a `YYYY-MM-DD` slug into the route's three segments. */
export function slugToSegments(slug: string): {
  day: string;
  month: string;
  year: string;
} {
  const [year = "", month = "", day = ""] = slug.split("-");
  return { year, month, day };
}

/** Rebuilds the `YYYY-MM-DD` slug from route segments. */
export function segmentsToSlug(
  year: string,
  month: string,
  day: string
): string {
  return `${year}-${month}-${day}`;
}
