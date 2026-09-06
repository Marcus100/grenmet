import { WeatherConditions } from "@/components/weather-conditions";
import { DAY_CONDITIONS } from "@/lib/forecast-data";

export default function NowPage() {
  return <WeatherConditions conditions={DAY_CONDITIONS[0]} />;
}
