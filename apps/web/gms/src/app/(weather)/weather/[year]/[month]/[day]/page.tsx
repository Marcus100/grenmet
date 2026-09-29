import { DayDetails } from "@/components/home/day-details";
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
  return (
    <div className="pb-12">
      <DayDetails day={forecast} />
    </div>
  );
}
