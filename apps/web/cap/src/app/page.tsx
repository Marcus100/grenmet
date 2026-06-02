import { AlertList } from "@/components/alert-list";
import { AlertMapPreview } from "@/components/alert-map-preview";
import {
  getActiveMap,
  getLatestActiveAlerts,
  getPastAlerts,
} from "@/lib/cap-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [activeAlerts, pastAlerts, activeMap] = await Promise.all([
    getLatestActiveAlerts(),
    getPastAlerts(),
    getActiveMap(),
  ]);

  return (
    <div className="bg-gm-surface-page">
      <section className="border-gm-border border-b bg-gm-surface">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_420px]">
          <div className="min-w-0">
            <p className="font-semibold text-gm-body-sm text-gm-navy leading-gm-body-sm">
              Active CAP alerts
            </p>
            <h1 className="mt-2 text-gm-heading-lg text-gm-text-primary leading-gm-heading-lg">
              Grenada Common Alerting Protocol
            </h1>
            <p className="mt-3 max-w-3xl text-gm-body-base text-gm-text-secondary leading-gm-body-base">
              Official machine-readable alert feed and public alert summaries
              for Grenada, Carriacou, and Petite Martinique.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Active" value={activeAlerts.count} />
            <Metric label="Archived" value={pastAlerts.count} />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px]">
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
      </section>
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
