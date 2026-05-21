import { WeatherConditions } from "@/components/weather-conditions";

const CONDITIONS = [
  { label: "Sunrise", value: "5:42 a.m." },
  { label: "Sunset", value: "6:25 p.m." },
  { label: "Max Temp", value: "31.0°C" },
  { label: "Min Temp", value: "26.0°C" },
  { label: "Wind Speed", value: "15–25 mph" },
  { label: "Wind Direction", value: "E to SE" },
  { label: "Sea State", value: "Moderate" },
  { label: "Wave Height", value: "4–6 ft" },
];

export function FridayMay22Forecast() {
  return <WeatherConditions conditions={CONDITIONS} />;
}
