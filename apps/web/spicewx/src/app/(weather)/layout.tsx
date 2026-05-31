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
    // Responsive container — intentional layout exception, not a spacing token
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <h1 className="mb-gm-16 pt-gm-24 font-bold text-gm-heading-md text-gm-navy">
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
