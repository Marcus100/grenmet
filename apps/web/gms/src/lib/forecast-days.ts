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
  /** `/forecasts/YYYY/MM/DD` — the dated forecast route for this day. */
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
    const slug = d.toISOString().slice(0, 10);
    return {
      condition: forecast.condition,
      date: d.getDate(),
      dayName: d.toLocaleString("en-US", { weekday: "short" }),
      high: forecast.high,
      isToday: i === 0,
      low: forecast.low,
      month: d.toLocaleString("en-US", { month: "short" }),
      path: `/forecasts/${slug.replace(/-/g, "/")}`,
      slug,
    };
  });
}

export function getUpcomingDaySlugs(): string[] {
  return getForecastDays()
    .slice(1)
    .map((d) => d.slug);
}

/** Splits a `YYYY-MM-DD` slug into the route's three segments. */
export function slugToSegments(slug: string): {
  day: string;
  month: string;
  year: string;
} {
  const [year, month, day] = slug.split("-");
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
