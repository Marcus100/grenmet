import {
  CircleCheckIcon,
  CircleHelpIcon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react";
import {
  type AlertsResult,
  alertsDisplayLevel,
  alertsSummary,
  type GreenStatus,
} from "@/lib/cap-alerts";
import { cn } from "@/lib/utils";

/**
 * The alert status icon: a check only for a fully read, empty outlook; an
 * information mark for Green alerts in effect; a question mark when a feed
 * can't be read or is incomplete; the warning triangle when a warning is in
 * effect. Each state has its own shape, so none relies on colour alone.
 */
export function AlertsIcon({
  alerts,
  green,
  className,
}: {
  alerts: AlertsResult;
  green?: GreenStatus;
  className?: string;
}) {
  let Icon = TriangleAlertIcon;
  if (alerts.status === "unavailable") {
    Icon = CircleHelpIcon;
  } else if (alerts.activeCount === 0) {
    const level = alertsDisplayLevel(alerts, green);
    if (level === "unknown") Icon = CircleHelpIcon;
    else if (green?.status === "ok" && green.count > 0) Icon = InfoIcon;
    else Icon = CircleCheckIcon;
  }
  return <Icon aria-hidden="true" className={cn("shrink-0", className)} />;
}

/**
 * The status in words for screen readers only: the masthead shows icon and
 * colour, and the warning ribbon at the top of the page spells out active
 * alerts (owner decision, 30 Sep 2026).
 */
export function AlertsSummary({
  alerts,
  green,
}: {
  alerts: AlertsResult;
  green?: GreenStatus;
}) {
  return <span className="sr-only">{alertsSummary(alerts, green)}</span>;
}
