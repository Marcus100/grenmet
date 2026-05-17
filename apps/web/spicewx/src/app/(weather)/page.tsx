import { WeatherConditions } from "@/components/weather-conditions";
import { CONDITIONS, WARNINGS } from "@/lib/forecast-data";

export default function NowPage() {
  return (
    <WeatherConditions
      conditions={CONDITIONS}
      title="Current Conditions"
      warnings={WARNINGS}
    />
  );
}
