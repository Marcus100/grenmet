import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { type AlertsResult, alertsSummary } from "@/lib/cap";
import { cn } from "@/lib/utils";

interface AlertsPanelProps {
  className?: string;
  result: AlertsResult;
}

/**
 * Desktop counterpart to CurrentAlertsAccordion: always-open sidebar rather
 * than a collapsible panel, since the wide layout has room to show every
 * hazard count at a glance.
 */
export function AlertsPanel({ className, result }: AlertsPanelProps) {
  const groups = result.status === "ok" ? result.groups : [];
  const summary = alertsSummary(result);

  return (
    <div className={cn("flex flex-col", className)}>
      <Link
        className="flex h-22 shrink-0 items-center gap-3.5 bg-gm-risk-yellow px-6"
        href="/warnings"
      >
        <TriangleAlertIcon
          aria-hidden="true"
          className="size-7 shrink-0 text-gm-text-primary"
        />
        <span className="flex-1 font-bold text-gm-text-primary text-heading-sm leading-heading-sm">
          Current alerts
        </span>
        <ChevronRightIcon
          aria-hidden="true"
          className="size-6 text-gm-text-primary"
        />
      </Link>
      <div className="flex flex-1 flex-col gap-0.5 bg-gm-navy px-6 pt-5 pb-5">
        {result.status === "unavailable" ? (
          <p className="text-body-sm text-gm-text-inverse">
            Warning information cannot be retrieved right now. This does not
            mean there are no warnings in effect — check the Grenada
            Meteorological Service directly.
          </p>
        ) : (
          groups.map((group) => (
            <span
              className="flex items-baseline gap-3.5 py-1.5"
              key={group.name}
            >
              <span className="w-4 text-right font-bold text-body text-gm-risk-yellow">
                {group.alerts.length}
              </span>
              <span className="text-body text-gm-text-inverse">
                {group.name}
              </span>
            </span>
          ))
        )}
        <span className="mt-auto flex items-center border-gm-text-inverse/20 border-t pt-4 font-semibold text-body-sm text-gm-text-inverse">
          {summary}
        </span>
      </div>
    </div>
  );
}
