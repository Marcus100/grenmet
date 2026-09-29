import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { type AlertsResult, alertsLevel, alertsSummary } from "@/lib/cap";
import { cn } from "@/lib/utils";
import { WARNING_LEVEL_SURFACE } from "@/lib/warning-level";

/**
 * Full-width band above the masthead whenever a warning is in effect or the
 * feed is down. Silent when there is nothing in effect — the header pill
 * already says so. An outage is spelled out, never shown as an all-clear.
 */
export function WarningRibbon({ alerts }: { alerts: AlertsResult }) {
  const level = alertsLevel(alerts);
  if (level === "none") {
    return null;
  }
  const detail =
    level === "unknown"
      ? "We cannot load alerts right now. This does not mean there are no alerts — listen to local radio or call NaDMA."
      : "Official alerts are in effect for the tri-island state.";

  return (
    <Link className={cn("block", WARNING_LEVEL_SURFACE[level])} href="/alerts">
      <span className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-body leading-body sm:px-6 xl:px-8">
        <TriangleAlertIcon aria-hidden="true" className="size-5 shrink-0" />
        <b className="font-bold">{alertsSummary(alerts)}</b>
        <span>{detail}</span>
        <span className="ml-auto whitespace-nowrap font-bold underline">
          View alerts
        </span>
      </span>
    </Link>
  );
}
