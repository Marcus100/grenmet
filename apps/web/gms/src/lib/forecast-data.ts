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
