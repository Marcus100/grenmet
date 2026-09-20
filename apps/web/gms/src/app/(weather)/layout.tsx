import { Suspense } from "react";
import { AlertsPanel } from "@/components/alerts-panel";
import { CurrentAlertsAccordion } from "@/components/current-alerts-accordion";
import { ExploringWebsite } from "@/components/exploring-website";
import { ForecastRefresh } from "@/components/forecast-refresh";
import { GmsNews } from "@/components/gms-news";
import { Hero } from "@/components/hero";
import { IssuedStamp } from "@/components/issued-stamp";
import { News } from "@/components/news";
import { PageTransition } from "@/components/page-transition";
import { RightNowSlot } from "@/components/right-now-slot";
import { WeatherDateNav } from "@/components/weather-date-nav";
import { WeatherNews } from "@/components/weather-news";
import { fetchActiveAlerts } from "@/lib/cap";
import { getForecastDays } from "@/lib/forecast-days";
import { getWeatherSnapshot } from "@/lib/weather-snapshot";

export default async function WeatherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [alerts, weather] = await Promise.all([
    fetchActiveAlerts(),
    getWeatherSnapshot(),
  ]);

  return (
    // Responsive container — intentional layout exception, not a spacing token
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      <ForecastRefresh />
      <h1 className="mb-4 pt-6 font-bold text-gm-navy text-heading-md lg:hidden">
        Your spice weather
      </h1>

      <CurrentAlertsAccordion className="lg:hidden" result={alerts} />

      <div className="relative mt-4 mb-8 lg:mt-8">
        <div className="hidden lg:block">
          <Hero />
        </div>

        <div className="relative flex flex-col overflow-hidden border border-gm-border bg-background lg:mt-8 lg:flex-row lg:rounded-md">
          <WeatherDateNav
            days={getForecastDays(weather.baseDate, weather.days)}
          />
          {/* min-w-0: without it the conditions grid's intrinsic width pushes
              this column wider than its share and the values clip. */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="border-gm-border border-b p-4 md:px-6 lg:p-7">
              <RightNowSlot observation={weather.observation} />
            </div>
            <PageTransition>{children}</PageTransition>
            <div className="border-gm-border border-t bg-gm-surface px-4 py-3 md:px-6 lg:px-7">
              <IssuedStamp label={weather.label} />
            </div>
          </div>
          <AlertsPanel
            className="hidden lg:flex lg:w-72 lg:flex-none xl:w-80"
            result={alerts}
          />
        </div>
      </div>

      <Suspense
        fallback={
          <section aria-busy="true" className="mb-8 space-y-5">
            <h2 className="font-bold text-gm-navy text-heading-md">
              Latest from us
            </h2>
            <p role="status">Loading updates…</p>
          </section>
        }
      >
        <GmsNews />
      </Suspense>

      <WeatherNews />

      <Suspense
        fallback={
          <section
            aria-busy="true"
            className="mb-4 flex flex-col gap-4 lg:-mx-8 lg:mb-8 lg:gap-7 lg:bg-gm-surface lg:px-8 lg:py-12"
          >
            <h2 className="flex h-7 items-center font-bold text-gm-navy text-heading-sm leading-heading-sm lg:text-heading-md lg:leading-heading-md">
              Latest publications
            </h2>
            <p role="status">Loading latest publications…</p>
          </section>
        }
      >
        <News />
      </Suspense>

      <ExploringWebsite />
    </div>
  );
}
