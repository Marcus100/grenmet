import { CircleDashedIcon } from "lucide-react";
import Link from "next/link";
import { AlertsIcon, AlertsSummary } from "@/components/alerts-summary";
import { CHECKING_ALERTS } from "@/components/with-alerts";
import { type AlertsResult, alertsLevel } from "@/lib/cap-alerts";
import { cn } from "@/lib/utils";
import { WARNING_LEVEL_SURFACE } from "@/lib/warning-level";

/**
 * The masthead's live warning status: colour, icon and the shared wording.
 * Icon and colour only (owner decision, 30 Sep 2026): the warning ribbon at
 * the top of the page names active alerts. The words stay for screen readers.
 */
const PILL =
  "h-10 items-center gap-2 whitespace-nowrap rounded-md px-3 font-bold text-body leading-body";

/**
 * The pill's place-holder while the feed has not answered: same box, so the
 * masthead does not shift, and neutral, so it reads as neither all-clear nor
 * outage. Still a link: the Alerts page is the place to look either way.
 */
export function CheckingStatusPill({ className }: { className?: string }) {
  return (
    <Link
      className={cn(
        PILL,
        "bg-gm-text-inverse/10 text-gm-text-inverse",
        className
      )}
      href="/alerts"
    >
      <CircleDashedIcon aria-hidden="true" className="size-4 shrink-0" />
      <span className="sr-only">{CHECKING_ALERTS}</span>
    </Link>
  );
}

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
        PILL,
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
