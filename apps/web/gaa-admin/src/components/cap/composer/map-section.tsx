import { AlertList } from "@/components/cap/alert-list";
import { AlertMapPreview } from "@/components/cap/alert-map-preview";
import { CapFeedUnavailable } from "@/components/cap/cap-feed-unavailable";
import { getActiveMap, getLatestActiveAlerts } from "@/lib/cap-api";

export async function MapSection() {
  const [activeMap, activeAlerts] = await Promise.all([
    getActiveMap(),
    getLatestActiveAlerts(),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <h2 className="mb-4 text-gm-text-primary text-heading-md leading-heading-md">
          Active Alert Map
        </h2>
        {activeMap.status === "ok" ? (
          <AlertMapPreview featureCollection={activeMap.value} />
        ) : (
          <CapFeedUnavailable feed="The active alert map" />
        )}
      </div>
      <aside className="min-w-0">
        <h2 className="mb-3 text-gm-text-primary text-heading-sm leading-heading-sm">
          Alerts
        </h2>
        {activeAlerts.status === "ok" ? (
          <AlertList
            alerts={activeAlerts.value.data}
            emptyLabel="There are no active map alerts."
          />
        ) : (
          <CapFeedUnavailable feed="The alert list" />
        )}
      </aside>
    </div>
  );
}
