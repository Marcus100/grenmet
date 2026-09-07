import { notFound } from "next/navigation";
import { WeatherConditions } from "@/components/weather-conditions";
import { DAY_CONDITIONS } from "@/lib/forecast-data";
import { getForecastDays, segmentsToSlug } from "@/lib/forecast-days";

interface Props {
  params: Promise<{ day: string; month: string; year: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { year, month, day } = await params;
  const slug = segmentsToSlug(year, month, day);
  const forecast = getForecastDays().find((d) => d.slug === slug);
  return {
    title: forecast
      ? `Forecast for ${forecast.dayName} ${forecast.date} ${forecast.month}`
      : "Forecast",
  };
}

export default async function ForecastDayPage({ params }: Props) {
  const { year, month, day } = await params;
  const slug = segmentsToSlug(year, month, day);

  // Index into the 5-day strip. Today is index 0 and is served at /forecasts,
  // so only the four upcoming tabs resolve here.
  const index = getForecastDays().findIndex((d) => d.slug === slug);
  const conditions = index > 0 ? DAY_CONDITIONS[index] : undefined;

  if (!conditions) {
    notFound();
  }

  return <WeatherConditions conditions={conditions} />;
}
