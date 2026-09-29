import { Suspense } from "react";
import { HomeSection } from "@/components/home/home-section";
import {
  Explained,
  ForecastDesk,
  PublicationsAndAlerts,
  Stories,
} from "@/components/home/live-sections";
import {
  Discover,
  ExploreToday,
  GrenadaInData,
  TodayAtAGlance,
} from "@/components/home/sample-sections";
import { WeatherNow } from "@/components/home/weather-now";
import { WeatherSurface } from "@/components/home/weather-surface";
import { defaultLocation } from "@/lib/locations";
import { getWeatherSnapshot } from "@/lib/weather-snapshot";

function Loading({ title }: { title: string }) {
  return (
    <HomeSection kicker="Loading" title={title}>
      <p aria-busy="true" role="status">
        Loading…
      </p>
    </HomeSection>
  );
}

/**
 * Home: today's issued forecast, then the Bold sky sections in the mockup's
 * order — official products before editorial, publications near the end.
 */
export default async function HomePage() {
  const weather = await getWeatherSnapshot();
  return (
    <>
      <WeatherSurface location={defaultLocation()} />
      <TodayAtAGlance />
      <WeatherNow forecasterNote={weather.days[0].summary} />
      <Suspense fallback={<Loading title="From the forecast desk" />}>
        <ForecastDesk weather={weather} />
      </Suspense>
      <Suspense fallback={<Loading title="Stories" />}>
        <Stories />
      </Suspense>
      <ExploreToday />
      <GrenadaInData />
      <Explained />
      <Discover />
      <Suspense fallback={<Loading title="Latest reports" />}>
        <PublicationsAndAlerts />
      </Suspense>
    </>
  );
}
