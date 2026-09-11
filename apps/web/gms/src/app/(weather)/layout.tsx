import { Suspense } from "react";
import { AlertsPanel } from "@/components/alerts-panel";
import { CurrentAlertsAccordion } from "@/components/current-alerts-accordion";
import { ExploringWebsite } from "@/components/exploring-website";
import { GmsNews } from "@/components/gms-news";
import { Hero } from "@/components/hero";
import { IssuedStamp } from "@/components/issued-stamp";
import { News } from "@/components/news";
import { RightNow } from "@/components/right-now";
import { TodayOnly } from "@/components/today-only";
import { WeatherDateNav } from "@/components/weather-date-nav";
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
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <h1 className="mb-4 pt-6 font-bold text-gm-navy text-heading-md lg:hidden">
        Your spice weather
      </h1>

      <TodayOnly>
        <CurrentAlertsAccordion className="lg:hidden" result={alerts} />

        <div className="mb-4 rounded-md border border-gm-border p-4 lg:hidden">
          <RightNow observation={weather.observation} />
        </div>
      </TodayOnly>

      {/* The brand surface is a background the forecast panel sits on, not a
          band the panel overlaps — hence no negative margin. */}
      <div className="relative mt-4 mb-8 lg:mt-8 lg:overflow-hidden lg:rounded-md lg:bg-gm-blue lg:px-8 lg:pt-10 lg:pb-8">
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
            <TodayOnly>
              <div className="hidden border-gm-border border-b p-7 lg:block">
                <RightNow observation={weather.observation} />
              </div>
            </TodayOnly>
            {children}
            <div className="border-gm-border border-t bg-gm-surface px-4 py-3 lg:px-7">
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

      <Suspense
        fallback={
          <section
            aria-busy="true"
            className="mb-4 flex flex-col gap-4 lg:-mx-8 lg:mb-8 lg:gap-7 lg:bg-gm-surface lg:px-8 lg:py-12"
          >
            <h2 className="flex h-7 items-center font-bold text-gm-navy text-heading-sm leading-heading-sm lg:text-heading-md lg:leading-heading-md">
              Weather news
            </h2>
            <p role="status">Loading weather news…</p>
          </section>
        }
      >
        <News />
      </Suspense>

      <ExploringWebsite />
    </div>
  );
}
