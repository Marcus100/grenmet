import { HomeSections } from "@/components/home/home-sections";
import { WeatherSurface } from "@/components/home/weather-surface";
import { defaultLocation } from "@/lib/locations";

/** Home: the latest reading and today's forecast in the hero, then the sections. */
export default function HomePage() {
  return (
    <>
      <WeatherSurface location={defaultLocation()} />
      <HomeSections />
    </>
  );
}
