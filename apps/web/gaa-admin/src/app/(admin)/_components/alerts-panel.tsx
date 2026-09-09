import Link from "next/link";
import { SeverityBadge } from "@/components/cap/severity-badge";
import { type CapAlert, primaryInfo } from "@/lib/cap-api";
import { relativeTime } from "./home-data";
import { loadAlerts } from "./home-loaders";
import { Panel, PanelEmpty, PanelUnavailable } from "./panel";

const MAX_ALERTS = 4;

export async function AlertsPanel({ className }: { className?: string }) {
  const alerts = await loadAlerts();

  return (
    <Panel
      action={{ href: "/cap", label: "CAP composer" }}
      className={className}
      description="Public alerts currently in effect for Grenada"
      title="Active alerts"
    >
      {alerts.ok ? (
        <AlertRows alerts={alerts.data.data.slice(0, MAX_ALERTS)} />
      ) : (
        <PanelUnavailable message={alerts.message} />
      )}
    </Panel>
  );
}

function AlertRows({ alerts }: { alerts: CapAlert[] }) {
  if (alerts.length === 0) {
    return <PanelEmpty>No alerts in effect. All clear.</PanelEmpty>;
  }

  return (
    <ul className="divide-y">
      {alerts.map((alert) => {
        const info = primaryInfo(alert);
        return (
          <li key={alert.id}>
            <Link
              className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              href={`/cap/alerts/${encodeURIComponent(alert.identifier)}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">
                  {info?.headline ?? alert.identifier}
                </p>
                <p className="mt-0.5 line-clamp-1 text-muted-foreground text-xs">
                  {info?.description ?? alert.note ?? "CAP alert"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <SeverityBadge severity={info?.severity} />
                <span className="text-muted-foreground text-xs">
                  {relativeTime(alert.sent)}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
