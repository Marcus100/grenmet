import { Button } from "@grenmet/ui/components/ui/button";
import { ArrowRight, FileText } from "lucide-react";
import Link from "next/link";
import {
  type CapAlert,
  capPublicUrl,
  formatDateTime,
  primaryInfo,
} from "@/lib/cap-api";
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
            className="border border-gm-border bg-white p-4 shadow-gm-card"
            key={alert.id}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {info ? <SeverityBadge severity={info.severity} /> : null}
                  <span className="text-gm-body-sm text-gm-text-muted leading-gm-body-sm">
                    {alert.lifecycle_state}
                  </span>
                  <span className="text-gm-body-sm text-gm-text-muted leading-gm-body-sm">
                    {formatDateTime(alert.sent)}
                  </span>
                </div>
                <h2 className="text-gm-heading-sm text-gm-text-primary leading-gm-heading-sm">
                  {info?.headline ?? alert.identifier}
                </h2>
                <p className="line-clamp-2 text-gm-body text-gm-text-secondary leading-gm-body">
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
