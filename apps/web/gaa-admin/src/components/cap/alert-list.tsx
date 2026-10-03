import { Button } from "@barrelsgd/ui/components/ui/button";
import { ArrowRight, FileText } from "lucide-react";
import Link from "next/link";
import {
  type CapAlert,
  capPublicUrl,
  formatDateTime,
  primaryInfo,
} from "@/lib/cap-api";
import { SEVERITY_RISK_VAR } from "@/lib/cap-severity";
import { SeverityBadge } from "./severity-badge";

export function AlertList({
  alerts,
  emptyLabel,
}: {
  alerts: CapAlert[];
  emptyLabel: string;
}) {
  if (alerts.length === 0) {
    return (
      <div className="border border-gm-border bg-gm-surface px-4 py-8 text-center text-gm-text-muted">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {alerts.map((alert) => {
        const info = primaryInfo(alert);
        return (
          <article
            className="flex border border-gm-border bg-card shadow-card"
            key={alert.id}
          >
            <span
              className="w-1 flex-shrink-0"
              style={{
                background: SEVERITY_RISK_VAR[info?.severity ?? "Unknown"],
              }}
            />
            <div className="flex flex-1 flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {info ? <SeverityBadge severity={info.severity} /> : null}
                  <span className="text-body-sm text-gm-text-muted leading-body-sm">
                    {alert.lifecycle_state}
                  </span>
                  <span className="text-body-sm text-gm-text-muted leading-body-sm">
                    {formatDateTime(alert.sent)}
                  </span>
                </div>
                <h2 className="text-gm-text-primary text-heading-sm leading-heading-sm">
                  {info?.headline ?? alert.identifier}
                </h2>
                <p className="line-clamp-2 text-body text-gm-text-secondary leading-body">
                  {info?.description ?? alert.note ?? "CAP alert"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`/cap/alerts/${encodeURIComponent(alert.identifier)}`}
                  >
                    <ArrowRight aria-hidden="true" />
                    Detail
                  </Link>
                </Button>
                {alert.xml_url ? (
                  <Button asChild size="sm" variant="ghost">
                    <a href={capPublicUrl(alert.xml_url)}>
                      <FileText aria-hidden="true" />
                      XML
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
