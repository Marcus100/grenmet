import {
  CircleCheckIcon,
  CircleHelpIcon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { type AlertsResult, alertsSummary } from "@/lib/cap-alerts";
import { cn } from "@/lib/utils";

/**
 * The alert status icon: a check for "no active alerts", an information mark
 * for Green alerts in effect, a question mark when a feed can't be reached,
 * the warning triangle otherwise. Each state has its own shape, so none
 * relies on colour alone.
 */
export function AlertsIcon({
  alerts,
  className,
}: {
  alerts: AlertsResult;
  className?: string;
}) {
  let Icon = TriangleAlertIcon;
  if (alerts.status === "unavailable") {
    Icon = CircleHelpIcon;
  } else if (alerts.activeCount === 0) {
    if (alerts.green?.status === "unavailable") Icon = CircleHelpIcon;
    else if (alerts.green && alerts.green.count > 0) Icon = InfoIcon;
    else Icon = CircleCheckIcon;
  }
  return <Icon aria-hidden="true" className={cn("shrink-0", className)} />;
}

/**
 * The status in words for screen readers only: the masthead shows icon and
 * colour, and the warning ribbon at the top of the page spells out active
 * alerts (owner decision, 30 Sep 2026).
 */
export function AlertsSummary({ alerts }: { alerts: AlertsResult }) {
  return <span className="sr-only">{alertsSummary(alerts)}</span>;
}
