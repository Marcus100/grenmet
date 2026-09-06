import { notFound } from "next/navigation";
import { FridayMay22Forecast } from "@/components/forecasts/friday-may-22";
import { ThursdayMay21Forecast } from "@/components/forecasts/thursday-may-21";
import { TuesdayMay19Forecast } from "@/components/forecasts/tuesday-may-19";
import { WednesdayMay20Forecast } from "@/components/forecasts/wednesday-may-20";
import { getUpcomingDaySlugs, segmentsToSlug } from "@/lib/forecast-days";

const FORECAST_COMPONENTS: Record<string, () => React.JSX.Element> = {
  "2026-05-19": TuesdayMay19Forecast,
  "2026-05-20": WednesdayMay20Forecast,
  "2026-05-21": ThursdayMay21Forecast,
  "2026-05-22": FridayMay22Forecast,
};

interface Props {
  params: Promise<{ day: string; month: string; year: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { year, month, day } = await params;
  return { title: `Forecast for ${year}-${month}-${day}` };
}

export default async function ForecastDayPage({ params }: Props) {
  const { year, month, day } = await params;
  const slug = segmentsToSlug(year, month, day);

  if (!getUpcomingDaySlugs().includes(slug)) {
    notFound();
  }

  const ForecastComponent = FORECAST_COMPONENTS[slug];

  if (!ForecastComponent) {
    notFound();
  }

  return <ForecastComponent />;
}
