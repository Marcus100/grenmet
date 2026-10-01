import Link from "next/link";
import { AlertsIcon, AlertsSummary } from "@/components/alerts-summary";
import { type AlertsResult, alertsLevel } from "@/lib/cap";
import { cn } from "@/lib/utils";
import { WARNING_LEVEL_SURFACE } from "@/lib/warning-level";

/**
 * The masthead's live warning status: colour, icon and the shared wording.
 * Icon and colour only (owner decision, 30 Sep 2026): the warning ribbon at
 * the top of the page names active alerts. The words stay for screen readers.
 */
export function WarningStatusPill({
  alerts,
  className,
}: {
  alerts: AlertsResult;
  className?: string;
}) {
  return (
    <Link
      className={cn(
        "h-10 items-center gap-2 whitespace-nowrap rounded-md px-3 font-bold text-body leading-body",
        WARNING_LEVEL_SURFACE[alertsLevel(alerts)],
        className
      )}
      href="/alerts"
    >
      <AlertsIcon alerts={alerts} className="size-4" />
      <AlertsSummary alerts={alerts} />
    </Link>
  );
}
