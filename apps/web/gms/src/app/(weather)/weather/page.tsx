import { DayDetails } from "@/components/home/day-details";
import { getWeatherSnapshot } from "@/lib/weather-snapshot";

export const metadata = { title: "Today's forecast" };

/** Today at the Weather section root: the hero plus today's details. */
export default async function TodayPage() {
  const weather = await getWeatherSnapshot();
  return (
    <div className="pb-12">
      <DayDetails day={weather.days[0]} label={weather.label} />
    </div>
  );
}
