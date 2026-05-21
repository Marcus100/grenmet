import { CurrentAlertsAccordion } from "@/components/current-alerts-accordion";
import { GmsNews } from "@/components/gms-news";
import { News } from "@/components/news";
import { WeatherDateNav } from "@/components/weather-date-nav";
import { WARNINGS } from "@/lib/forecast-data";

export default function WeatherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <h1 className="mb-4 pt-6 font-bold text-3xl text-gm-navy">
        Your spice weather
      </h1>

      <CurrentAlertsAccordion warnings={WARNINGS} />

      <div className="mb-4 overflow-hidden border border-gm-border">
        <WeatherDateNav />
        {children}
      </div>

      <GmsNews />

      <News />
    </div>
  );
}
