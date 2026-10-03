import { HomeSections } from "@/components/home/home-sections";
import { WeatherSurface } from "@/components/home/weather-surface";
import { defaultLocation } from "@/lib/locations";

interface Props {
  params: Promise<{ year: string; month: string; day: string }>;
}
export async function generateMetadata({ params }: Props) {
  const { year, month, day } = await params;
  return { title: `Forecast for ${year}-${month}-${day}` };
}
/** A dated day: the hero with that day's tab and panel selected, then the home sections. */
export default async function ForecastDayPage({ params }: Props) {
  const { year, month, day } = await params;
  return (
    <>
      <WeatherSurface
        location={defaultLocation()}
        selected={`${year}-${month}-${day}`}
      />
      <HomeSections />
    </>
  );
}
