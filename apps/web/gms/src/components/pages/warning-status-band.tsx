import { ShieldCheckIcon, TriangleAlertIcon } from "lucide-react";
import {
  type AlertsResult,
  alertsLevel,
  alertsSummary,
} from "@/lib/cap-alerts";
import { cn } from "@/lib/utils";
import {
  WARNING_LEVEL_GUIDANCE,
  WARNING_LEVEL_SURFACE,
} from "@/lib/warning-level";

const CHECKED = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Grenada",
  timeStyle: "short",
});

/**
 * The warnings page's status band: the same colour and wording as the header
 * pill, the level's guidance, and when the feed was last read. An outage is
 * grey and says it is not an all-clear.
 */
export function WarningStatusBand({
  alerts,
  checkedAt,
}: {
  alerts: AlertsResult;
  checkedAt: Date;
}) {
  const level = alertsLevel(alerts);
  const unavailable = alerts.status === "unavailable";
  // Only the all-clear gets the shield; every other state keeps the warning mark.
  const StatusIcon = level === "none" ? ShieldCheckIcon : TriangleAlertIcon;
  return (
    <div
      className={cn(
        "rounded-gm-card mb-6 flex flex-col gap-2 p-5",
        WARNING_LEVEL_SURFACE[level]
      )}
      role="status"
    >
      <p className="font-gm-display text-gm-display flex items-center gap-2 font-bold tracking-wide uppercase">
        <StatusIcon aria-hidden="true" className="size-8 shrink-0" />
        {alertsSummary(alerts)}
      </p>
      <p className="text-body-base leading-body-base max-w-prose">
        {unavailable
          ? "This is not an all-clear. Our warning feed did not respond. Listen to local radio, call the forecast office or check NaDMA."
          : WARNING_LEVEL_GUIDANCE[level]}
      </p>
      <p className="text-body-sm leading-body-sm font-mono">
        Last checked {CHECKED.format(checkedAt)} AST · CAP feed{" "}
        {unavailable ? "not responding" : "OK"}
      </p>
    </div>
  );
}
