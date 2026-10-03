import { WeatherSurface } from "@/components/home/weather-surface";
import { defaultLocation } from "@/lib/locations";

export const metadata = { title: "Today's forecast" };

/** Today at the Weather section root: the hero. */
export default function TodayPage() {
  return (
    <div className="pb-12">
      <WeatherSurface location={defaultLocation()} />
    </div>
  );
}
