import { WeatherConditions } from "@/components/weather-conditions";
import { WARNINGS } from "@/lib/forecast-data";

const CONDITIONS = [
  { label: "Sunrise", value: "5:42 a.m." },
  { label: "Sunset", value: "6:25 p.m." },
  { label: "Max Temp", value: "31.0°C" },
  { label: "Min Temp", value: "26.0°C" },
  { label: "Wind Speed", value: "15–25 mph" },
  { label: "Wind Direction", value: "E to SE" },
  { label: "Sea State", value: "Moderate" },
  { label: "Wave Height", value: "4–6 ft" },
  { label: "Warning", value: "None" },
];

export function WednesdayMay20Forecast() {
  return (
    <WeatherConditions
      conditions={CONDITIONS}
      title="Key Conditions — Wed 20 May"
      warnings={WARNINGS}
    />
  );
}
