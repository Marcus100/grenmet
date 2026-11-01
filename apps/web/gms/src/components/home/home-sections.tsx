import { Suspense } from "react";
import { ExploreToday, GrenadaInData } from "@/components/home/data-sections";
import { Discover } from "@/components/home/discover";
import { HomeSection } from "@/components/home/home-section";
import {
  Explained,
  ForecastDesk,
  LatestReports,
  Stories,
} from "@/components/home/live-sections";
import { WeatherNow } from "@/components/home/weather-now";

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
 * The sections under the hero (homepage v2, owner 1 Nov 2026): the
 * forecasters' words first, then the week ahead and the reports they will
 * fold into (#998, #1000), live imagery, stories, the climate record and
 * explore. The alerts sign-up lives at the top of the footer.
 * Backgrounds alternate white / surface in this order. Shared by the home page
 * and the dated forecast days, so picking a day in the strip swaps only the
 * hero's selection and keeps the page like a tab.
 */
export function HomeSections() {
  return (
    <>
      <Suspense fallback={<Loading title="From the forecast desk" />}>
        <ForecastDesk />
      </Suspense>
      <ExploreToday />
      <Suspense fallback={<Loading title="Latest reports" />}>
        <LatestReports />
      </Suspense>
      <WeatherNow />
      <Suspense fallback={<Loading title="Weather news" />}>
        <Stories />
      </Suspense>
      <GrenadaInData />
      <Explained />
      <Discover />
    </>
  );
}
