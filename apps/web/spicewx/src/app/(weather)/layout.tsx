import { Alerts } from "@/components/alerts";
import { GmsNews } from "@/components/gms-news";
import { News } from "@/components/news";
import { PageHeader } from "@/components/page-header";
import { WeatherDateNav } from "@/components/weather-date-nav";

export default function WeatherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title="Your spice weather" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="lg:hidden">
          <Alerts />
        </div>

        <div className="mb-4 flex flex-col overflow-hidden rounded-xl border border-gm-border bg-white shadow-sm lg:flex-row">
          <WeatherDateNav />
          {children}
        </div>

        <GmsNews />

        <News />
      </div>
    </>
  );
}
