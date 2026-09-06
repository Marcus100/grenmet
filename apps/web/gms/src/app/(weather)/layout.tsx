import { AlertsPanel } from "@/components/alerts-panel";
import { CurrentAlertsAccordion } from "@/components/current-alerts-accordion";
import { ExploringWebsite } from "@/components/exploring-website";
import { GmsNews } from "@/components/gms-news";
import { Hero } from "@/components/hero";
import { IssuedStamp } from "@/components/issued-stamp";
import { News } from "@/components/news";
import { RightNow } from "@/components/right-now";
import { WeatherDateNav } from "@/components/weather-date-nav";
import { fetchActiveAlerts } from "@/lib/cap";

export default async function WeatherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const alerts = await fetchActiveAlerts();

  return (
    // Responsive container — intentional layout exception, not a spacing token
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <h1 className="mb-4 pt-6 font-bold text-gm-navy text-heading-md lg:hidden">
        Your spice weather
      </h1>

      <div className="hidden lg:block">
        <Hero />
      </div>

      <CurrentAlertsAccordion className="lg:hidden" result={alerts} />

      <div className="mb-4 rounded-md border border-gm-border p-4 lg:hidden">
        <RightNow />
      </div>

      {/* relative: paints above the positioned hero it overlaps on desktop */}
      <div className="relative mb-4 flex flex-col overflow-hidden border border-gm-border bg-background lg:-mt-25 lg:flex-row lg:rounded-md">
        <WeatherDateNav />
        <div className="flex flex-1 flex-col">
          <div className="hidden border-gm-border border-b p-7 lg:block">
            <RightNow />
          </div>
          {children}
          <div className="border-gm-border border-t bg-gm-surface px-4 py-3 lg:px-7">
            <IssuedStamp />
          </div>
        </div>
        <AlertsPanel
          className="hidden lg:flex lg:w-95 lg:flex-none"
          result={alerts}
        />
      </div>

      <GmsNews />

      <News />

      <ExploringWebsite />
    </div>
  );
}
