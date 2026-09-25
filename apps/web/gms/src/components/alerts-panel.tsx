import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { type AlertsResult, alertsLevel, alertsSummary } from "@/lib/cap";
import { cn } from "@/lib/utils";
import { WARNING_LEVEL_SURFACE } from "@/lib/warning-level";

interface AlertsPanelProps {
  className?: string;
  result: AlertsResult;
}

/**
 * Desktop counterpart to CurrentAlertsAccordion: always-open sidebar rather
 * than a collapsible panel, since the wide layout has room to show every
 * hazard count at a glance. The header takes the colour of the most severe
 * alert in effect and states the level and count in words.
 */
export function AlertsPanel({ className, result }: AlertsPanelProps) {
  const groups = result.status === "ok" ? result.groups : [];
  // The header is the status line — level and count in words, so the colour
  // is never the only signal.
  const summary = alertsSummary(result);
  const level = alertsLevel(result);

  return (
    <div className={cn("flex flex-col", className)}>
      <Link
        className={cn(
          "flex shrink-0 items-center px-6 py-3",
          WARNING_LEVEL_SURFACE[level]
        )}
        href="/warnings"
      >
        <span className="flex items-center gap-2.5">
          <TriangleAlertIcon aria-hidden="true" className="size-5 shrink-0" />
          <span className="font-bold text-body-base leading-body-base">
            {summary}
          </span>
        </span>
      </Link>
      <div className="flex flex-1 flex-col bg-gm-navy px-6 py-4">
        {result.status === "unavailable" ? (
          <p className="text-body-sm text-gm-text-inverse">
            Warning information cannot be retrieved right now. This does not
            mean there are no warnings in effect — check the Grenada
            Meteorological Service directly.
          </p>
        ) : (
          groups.map((group) => {
            const count = group.alerts.length;
            return (
              <Link
                className="flex items-baseline gap-3 py-0.5 hover:underline focus-visible:outline"
                href="/warnings"
                key={group.name}
              >
                {/* Empty hazards stay readable but stop competing with the
                    ones actually in effect. */}
                <span
                  className={cn(
                    "w-4 text-right font-bold text-body-sm",
                    count > 0
                      ? "text-gm-risk-yellow"
                      : "text-gm-text-inverse/50"
                  )}
                >
                  {count}
                </span>
                <span
                  className={cn(
                    "text-body-sm leading-body-sm",
                    count > 0
                      ? "text-gm-text-inverse"
                      : "text-gm-text-inverse/50"
                  )}
                >
                  {group.name}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
