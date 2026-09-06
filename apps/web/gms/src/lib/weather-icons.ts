import type { LucideIcon } from "lucide-react";
import { Cloud, CloudRain, CloudSun, Sun } from "lucide-react";

export type WeatherCondition = "cloudy" | "partly-cloudy" | "showers" | "sunny";

export const WEATHER_CONDITION_LABEL: Record<WeatherCondition, string> = {
  cloudy: "Cloudy",
  "partly-cloudy": "Sunny intervals",
  showers: "Showers",
  sunny: "Sunny",
};

const WEATHER_ICON: Record<WeatherCondition, LucideIcon> = {
  cloudy: Cloud,
  "partly-cloudy": CloudSun,
  showers: CloudRain,
  sunny: Sun,
};

export function weatherIcon(condition: WeatherCondition): LucideIcon {
  return WEATHER_ICON[condition];
}
