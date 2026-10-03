import { Suspense } from "react";
import { Discover } from "@/components/home/discover";
import { HomeSection } from "@/components/home/home-section";
import {
  Explained,
  ForecastDesk,
  GetAlertsStrip,
  LatestReports,
  Stories,
} from "@/components/home/live-sections";
import { ExploreToday, GrenadaInData } from "@/components/home/sample-sections";
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
 * The Bold sky sections under the hero (owner order, 30 Sep 2026): the alerts
 * sign-up strip, live imagery and the forecasters' words, planning, the
 * explained reports, editorial and fun, with the climate record last.
 * Backgrounds alternate white / surface in this order. Shared by the home page
 * and the dated forecast days, so picking a day in the strip swaps only the
 * hero's selection and keeps the page like a tab.
 */
export function HomeSections() {
  return (
    <>
      <GetAlertsStrip />
      <WeatherNow />
      <Suspense fallback={<Loading title="From the forecast desk" />}>
        <ForecastDesk />
      </Suspense>
      <ExploreToday />
      <Suspense fallback={<Loading title="Latest reports" />}>
        <LatestReports />
      </Suspense>
      <Suspense fallback={<Loading title="Stories" />}>
        <Stories />
      </Suspense>
      <Explained />
      <Discover />
      <GrenadaInData />
    </>
  );
}
