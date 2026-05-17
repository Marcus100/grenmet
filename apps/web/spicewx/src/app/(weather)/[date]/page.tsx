import { notFound } from "next/navigation";
import { WeatherConditions } from "@/components/weather-conditions";
import { CONDITIONS, WARNINGS } from "@/lib/forecast-data";
import { getUpcomingDaySlugs } from "@/lib/forecast-days";

interface Props {
  params: Promise<{ date: string }>;
}

export default async function ForecastDayPage({ params }: Props) {
  const { date } = await params;

  if (!getUpcomingDaySlugs().includes(date)) {
    notFound();
  }

  const d = new Date(`${date}T12:00:00`);
  const displayDate = d.toLocaleString("en-US", {
    day: "numeric",
    month: "long",
  });

  return (
    <WeatherConditions
      conditions={CONDITIONS}
      title={`Key Conditions — ${displayDate}`}
      warnings={WARNINGS}
    />
  );
}
