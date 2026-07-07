import { AlertList } from "@/components/cap/alert-list";
import { AlertMapPreview } from "@/components/cap/alert-map-preview";
import { getActiveMap, getLatestActiveAlerts } from "@/lib/cap-api";

export async function MapSection() {
  const [activeMap, activeAlerts] = await Promise.all([
    getActiveMap(),
    getLatestActiveAlerts(),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <h2 className="mb-4 text-gm-heading-md text-gm-text-primary leading-gm-heading-md">
          Active Alert Map
        </h2>
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
    </div>
  );
}
