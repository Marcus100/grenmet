import { CurrentAlertsAccordion } from "@/components/current-alerts-accordion";
import { GmsNews } from "@/components/gms-news";
import { News } from "@/components/news";
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
      <h1 className="mb-4 pt-6 font-bold text-heading-md text-navy">
        Your spice weather
      </h1>

      <CurrentAlertsAccordion result={alerts} />

      <div className="mb-4 overflow-hidden border border-gm-border">
        <WeatherDateNav />
        {children}
      </div>

      <GmsNews />

      <News />
    </div>
  );
}
