import { AlertList } from "@/components/cap/alert-list";
import { AlertMapPreview } from "@/components/cap/alert-map-preview";
import {
  getActiveMap,
  getLatestActiveAlerts,
  getPastAlerts,
} from "@/lib/cap-api";

export async function AlertsSection() {
  const [activeAlerts, pastAlerts, activeMap] = await Promise.all([
    getLatestActiveAlerts(),
    getPastAlerts(),
    getActiveMap(),
  ]);

  return (
    <div className="space-y-8">
      <div className="grid max-w-md grid-cols-2 gap-3">
        <Metric label="Active" value={activeAlerts.count} />
        <Metric label="Archived" value={pastAlerts.count} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-8">
          <div>
            <SectionHeading title="Current Alerts" />
            <AlertList
              alerts={activeAlerts.data}
              emptyLabel="There are no active CAP alerts."
            />
          </div>
          <div>
            <SectionHeading title="Past Alerts" />
            <AlertList
              alerts={pastAlerts.data}
              emptyLabel="No expired or cancelled alerts are available."
            />
          </div>
        </div>
        <aside className="space-y-3">
          <SectionHeading title="Active Map" />
          <AlertMapPreview featureCollection={activeMap} />
        </aside>
      </div>
    </div>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="mb-3 text-gm-heading-sm text-gm-text-primary leading-gm-heading-sm">
      {title}
    </h2>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-gm-border bg-white p-4 shadow-gm-card">
      <div className="text-gm-label text-gm-text-muted uppercase leading-gm-label">
        {label}
      </div>
      <div className="mt-2 text-gm-heading-md text-gm-text-primary leading-gm-heading-md">
        {value}
      </div>
    </div>
  );
}
