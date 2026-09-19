import { WeatherConditions } from "@/components/weather-conditions";
import { getWeatherSnapshot } from "@/lib/weather-snapshot";
export default async function NowPage() {
  const snapshot = await getWeatherSnapshot();
  return (
    <>
      <p className="border-b p-4 text-gm-text-secondary">
        {snapshot.days[0].summary}
      </p>
      <WeatherConditions conditions={snapshot.days[0].conditions} />
      {snapshot.days[0].source ? (
        <p className="p-3 text-muted-foreground text-xs">
          {snapshot.days[0].source}
        </p>
      ) : null}
    </>
  );
}
