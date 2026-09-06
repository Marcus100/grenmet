import { DAY_FORECASTS } from "@/lib/forecast-data";
import type { WeatherCondition } from "@/lib/weather-icons";

export interface ForecastDay {
  condition: WeatherCondition;
  date: number;
  dayName: string;
  high: number;
  isToday: boolean;
  low: number;
  month: string;
  slug: string; // YYYY-MM-DD, used as the [date] URL segment
}

export function getForecastDays(): ForecastDay[] {
  const today = new Date();
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const forecast = DAY_FORECASTS[i];
    return {
      condition: forecast.condition,
      date: d.getDate(),
      dayName: d.toLocaleString("en-US", { weekday: "short" }),
      high: forecast.high,
      isToday: i === 0,
      low: forecast.low,
      month: d.toLocaleString("en-US", { month: "short" }),
      slug: d.toISOString().slice(0, 10),
    };
  });
}

export function getUpcomingDaySlugs(): string[] {
  return getForecastDays()
    .slice(1)
    .map((d) => d.slug);
}
