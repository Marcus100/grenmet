import { ForecastRefresh } from "@/components/forecast-refresh";
import { SkyHero } from "@/components/home/sky-hero";
import { WarningTakeover } from "@/components/home/warning-takeover";
import { fetchActiveAlerts } from "@/lib/cap";
import { getWeatherSnapshot } from "@/lib/weather-snapshot";

/**
 * The dated weather surface — `/`, `/weather` and `/weather/YYYY/MM/DD`:
 * a take-action takeover when one is live, then the sky hero with the day
 * strip. Each page renders the selected day's details beneath it.
 */
export default async function WeatherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [alerts, weather] = await Promise.all([
    fetchActiveAlerts(),
    getWeatherSnapshot(),
  ]);

  return (
    <>
      <ForecastRefresh />
      <WarningTakeover alerts={alerts} />
      <SkyHero weather={weather} />
      {children}
    </>
  );
}
