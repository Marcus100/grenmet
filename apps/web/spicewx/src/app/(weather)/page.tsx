import { WeatherConditions } from "@/components/weather-conditions";
import { TODAY_CONDITIONS, WARNINGS } from "@/lib/forecast-data";

export default function NowPage() {
  return (
    <WeatherConditions
      conditions={TODAY_CONDITIONS}
      title="Current Conditions"
      warnings={WARNINGS}
    />
  );
}
