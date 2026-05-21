import { WeatherConditions } from "@/components/weather-conditions";

const CONDITIONS = [
  { label: "Sunrise", value: "5:42 a.m." },
  { label: "Sunset", value: "6:25 p.m." },
  { label: "Max Temp", value: "31.0°C" },
  { label: "Min Temp", value: "26.0°C" },
  { label: "Wind Speed", value: "15–25 mph" },
  { label: "Wind Direction", value: "E to SE" },
  { label: "Sea State", value: "Moderate to slightly rough" },
  { label: "Wave Height", value: "6–8 ft" },
  { label: "Low Tide", value: "10:30 a.m." },
  { label: "High Tide", value: "4:45 p.m." },
];

export function TuesdayMay19Forecast() {
  return <WeatherConditions conditions={CONDITIONS} />;
}
