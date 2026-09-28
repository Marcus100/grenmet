import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { type AlertsResult, alertsLevel, alertsSummary } from "@/lib/cap";
import { cn } from "@/lib/utils";
import { WARNING_LEVEL_SURFACE } from "@/lib/warning-level";

/** The masthead's live warning status: colour, icon and the shared wording. */
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
      href="/warnings"
    >
      <TriangleAlertIcon aria-hidden="true" className="size-4" />
      {alertsSummary(alerts)}
    </Link>
  );
}
