import type { WeatherCondition } from "@/lib/weather-icons";

export interface Condition {
  label: string;
  value: string;
}

export interface DayForecast {
  condition: WeatherCondition;
  high: number;
  low: number;
}

/**
 * Per-day icon and high/low for the 5-day strip, index 0 = today. Static mock
 * — there is no per-day forecast API yet, only the live CAP alerts feed.
 */
export const DAY_FORECASTS: DayForecast[] = [
  { condition: "partly-cloudy", high: 31, low: 25 },
  { condition: "cloudy", high: 30, low: 25 },
  { condition: "showers", high: 29, low: 24 },
  { condition: "partly-cloudy", high: 30, low: 25 },
  { condition: "sunny", high: 31, low: 25 },
];

export interface CurrentConditions {
  condition: WeatherCondition;
  conditionLabel: string;
  feelsLike: number;
  temperature: number;
  wind: string;
}

export const CURRENT_CONDITIONS: CurrentConditions = {
  condition: "partly-cloudy",
  conditionLabel: "Sunny intervals",
  feelsLike: 32,
  temperature: 28,
  wind: "NE 14 mph",
};

export const FORECAST_ISSUED = {
  issuedAt: "5:00 am AST",
  nextUpdate: "11:00 am",
};

export interface Warning {
  count: number;
  region: string;
}

export const WARNINGS: Warning[] = [
  { region: "Tropical Cyclone", count: 0 },
  { region: "Marine / Small Craft", count: 0 },
  { region: "Flood / Heavy Rain", count: 0 },
  { region: "Thunderstorm", count: 0 },
  { region: "Wind", count: 0 },
  { region: "Heat", count: 0 },
  { region: "Dust / Haze", count: 0 },
  { region: "Coastal Hazard", count: 0 },
];

export const TODAY_CONDITIONS: Condition[] = [
  { label: "Max Temp", value: "31°C" },
  { label: "Wind Speed", value: "10–20 mph" },
  { label: "Wind Direction", value: "NE to E" },
  { label: "Rain Chance", value: "40%" },
  { label: "Sea State", value: "Moderate to rough" },
  { label: "Wave Height", value: "6–9 ft" },
  { label: "Low Tide", value: "12:30 pm" },
  { label: "High Tide", value: "4:45 pm" },
  { label: "Sunset Today", value: "06:30 pm" },
  { label: "Sunrise Tomorrow", value: "05:50 am" },
];

/**
 * Conditions for each tab in the 5-day strip, index 0 = today.
 *
 * Keyed by position, not by date. The strip rolls forward every day, so a
 * date-keyed map can only match during the few days it was written for — the
 * previous map was pinned to May 2026 and every tab but today fell through to
 * notFound(). Real per-date content will arrive keyed by date from the forecast
 * API; until then position is the only mapping that stays correct.
 */
export const DAY_CONDITIONS: Condition[][] = [
  TODAY_CONDITIONS,
  [
    { label: "Sunrise", value: "5:42 a.m." },
    { label: "Sunset", value: "6:25 p.m." },
    { label: "Max Temp", value: "31.0\u00b0C" },
    { label: "Min Temp", value: "26.0\u00b0C" },
    { label: "Wind Speed", value: "15\u201325 mph" },
    { label: "Wind Direction", value: "E to SE" },
    { label: "Sea State", value: "Moderate to slightly rough" },
    { label: "Wave Height", value: "6\u20138 ft" },
    { label: "Low Tide", value: "10:30 a.m." },
    { label: "High Tide", value: "4:45 p.m." },
  ],
  [
    { label: "Sunrise", value: "5:42 a.m." },
    { label: "Sunset", value: "6:25 p.m." },
    { label: "Max Temp", value: "30.0\u00b0C" },
    { label: "Min Temp", value: "25.0\u00b0C" },
    { label: "Wind Speed", value: "10\u201320 mph" },
    { label: "Wind Direction", value: "NE to E" },
    { label: "Sea State", value: "Moderate" },
    { label: "Wave Height", value: "5\u20137 ft" },
    { label: "Low Tide", value: "11:15 a.m." },
    { label: "High Tide", value: "5:30 p.m." },
  ],
  [
    { label: "Sunrise", value: "5:43 a.m." },
    { label: "Sunset", value: "6:24 p.m." },
    { label: "Max Temp", value: "29.0\u00b0C" },
    { label: "Min Temp", value: "24.0\u00b0C" },
    { label: "Wind Speed", value: "10\u201318 mph" },
    { label: "Wind Direction", value: "E" },
    { label: "Sea State", value: "Moderate to rough" },
    { label: "Wave Height", value: "6\u20139 ft" },
    { label: "Low Tide", value: "12:05 p.m." },
    { label: "High Tide", value: "6:10 p.m." },
  ],
  [
    { label: "Sunrise", value: "5:43 a.m." },
    { label: "Sunset", value: "6:23 p.m." },
    { label: "Max Temp", value: "31.0\u00b0C" },
    { label: "Min Temp", value: "25.0\u00b0C" },
    { label: "Wind Speed", value: "12\u201320 mph" },
    { label: "Wind Direction", value: "NE" },
    { label: "Sea State", value: "Slight to moderate" },
    { label: "Wave Height", value: "4\u20136 ft" },
    { label: "Low Tide", value: "12:50 p.m." },
    { label: "High Tide", value: "6:55 p.m." },
  ],
];
