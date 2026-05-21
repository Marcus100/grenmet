import { notFound } from "next/navigation";
import { FridayMay22Forecast } from "@/components/forecasts/friday-may-22";
import { ThursdayMay21Forecast } from "@/components/forecasts/thursday-may-21";
import { TuesdayMay19Forecast } from "@/components/forecasts/tuesday-may-19";
import { WednesdayMay20Forecast } from "@/components/forecasts/wednesday-may-20";
import { getUpcomingDaySlugs } from "@/lib/forecast-days";

const FORECAST_COMPONENTS: Record<string, () => React.JSX.Element> = {
  "2026-05-19": TuesdayMay19Forecast,
  "2026-05-20": WednesdayMay20Forecast,
  "2026-05-21": ThursdayMay21Forecast,
  "2026-05-22": FridayMay22Forecast,
};

interface Props {
  params: Promise<{ date: string }>;
}

export default async function ForecastDayPage({ params }: Props) {
  const { date } = await params;

  if (!getUpcomingDaySlugs().includes(date)) {
    notFound();
  }

  const ForecastComponent = FORECAST_COMPONENTS[date];

  if (!ForecastComponent) {
    notFound();
  }

  return <ForecastComponent />;
}
