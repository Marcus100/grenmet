import { WeatherConditions } from "@/components/weather-conditions";
import { getWeatherSnapshot } from "@/lib/weather-snapshot";

interface Props {
  params: Promise<{ year: string; month: string; day: string }>;
}
export async function generateMetadata({ params }: Props) {
  const { year, month, day } = await params;
  return { title: `Forecast for ${year}-${month}-${day}` };
}
export default async function ForecastDayPage({ params }: Props) {
  const { year, month, day } = await params;
  const snapshot = await getWeatherSnapshot();
  const forecast = snapshot.days.find(
    (item) => item.date === `${year}-${month}-${day}`
  );
  if (!forecast)
    return (
      <p className="p-5">
        No issued forecast is available for this date. Choose a date in the
        forecast strip.
      </p>
    );
  return (
    <>
      <p className="border-b p-4 text-gm-text-secondary">{forecast.summary}</p>
      <WeatherConditions conditions={forecast.conditions} />
      <p className="p-3 text-muted-foreground text-xs">{forecast.source}</p>
    </>
  );
}
