import { AlertList } from "@/components/cap/alert-list";
import { AlertMapPreview } from "@/components/cap/alert-map-preview";
import { getActiveMap, getLatestActiveAlerts } from "@/lib/cap-api";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Alert Map",
};

export default async function MapPage() {
  const [activeMap, activeAlerts] = await Promise.all([
    getActiveMap(),
    getLatestActiveAlerts(),
  ]);

  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <h1 className="mb-4 text-gm-heading-md text-gm-text-primary leading-gm-heading-md">
          Active Alert Map
        </h1>
        <AlertMapPreview featureCollection={activeMap} />
      </div>
      <aside className="min-w-0">
        <h2 className="mb-3 text-gm-heading-sm text-gm-text-primary leading-gm-heading-sm">
          Alerts
        </h2>
        <AlertList
          alerts={activeAlerts.data}
          emptyLabel="There are no active map alerts."
        />
      </aside>
    </section>
  );
}
