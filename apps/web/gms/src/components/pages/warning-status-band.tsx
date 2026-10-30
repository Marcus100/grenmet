import { ShieldCheckIcon, TriangleAlertIcon } from "lucide-react";
import {
  type AlertsResult,
  alertsLevel,
  alertsSummary,
} from "@/lib/cap-alerts";
import type { GreenAlerts } from "@/lib/green-alerts";
import { cn } from "@/lib/utils";
import {
  WARNING_LEVEL_GUIDANCE,
  WARNING_LEVEL_SURFACE,
  type WarningLevel,
} from "@/lib/warning-level";

const CHECKED = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Grenada",
  timeStyle: "short",
});

interface BandCopy {
  /** Only a true all-clear gets the shield. */
  allClear: boolean;
  guidance: string;
  headline: string;
  level: WarningLevel;
  unavailable: boolean;
}

/**
 * What the band says. "No active alerts" is only said when no warning is in
 * effect AND the Green alerts are known to be none. Green alerts in effect are
 * named as Green level; an unreadable Green feed is never an all-clear.
 */
function bandCopy(alerts: AlertsResult, green?: GreenAlerts): BandCopy {
  const level = alertsLevel(alerts);
  const warningsUnavailable = alerts.status === "unavailable";
  if (level !== "none" || warningsUnavailable) {
    return {
      headline: alertsSummary(alerts),
      guidance: warningsUnavailable
        ? "This is not an all-clear. Our warning feed did not respond. Listen to local radio, call the forecast office or check NaDMA."
        : WARNING_LEVEL_GUIDANCE[level],
      level,
      allClear: false,
      unavailable: warningsUnavailable,
    };
  }
  if (green?.status === "unavailable") {
    return {
      headline: "No warnings or watches",
      guidance:
        "This is not an all-clear. The Green alerts could not be checked right now. Check the Grenada Meteorological Service directly.",
      level: "unknown",
      allClear: false,
      unavailable: true,
    };
  }
  if (green?.status === "ok" && green.items.length > 0) {
    const count = green.items.length;
    return {
      headline: `Green level · ${count} active`,
      guidance:
        "Green is the lowest level. The Green alerts below are listed for awareness.",
      level: "none",
      allClear: false,
      unavailable: false,
    };
  }
  return {
    headline: alertsSummary(alerts),
    guidance: WARNING_LEVEL_GUIDANCE.none,
    level: "none",
    allClear: true,
    unavailable: false,
  };
}

/**
 * The warnings page's status band: the same colour and wording as the header
 * pill, the level's guidance, and when the feeds were last read. An outage is
 * grey and says it is not an all-clear. Pass `green` to include the Green
 * alerts in the wording.
 */
export function WarningStatusBand({
  alerts,
  checkedAt,
  green,
}: {
  alerts: AlertsResult;
  checkedAt: Date;
  green?: GreenAlerts;
}) {
  const copy = bandCopy(alerts, green);
  const StatusIcon = copy.allClear ? ShieldCheckIcon : TriangleAlertIcon;
  const greenNote =
    green === undefined
      ? ""
      : ` · Green alerts ${green.status === "unavailable" ? "not responding" : "OK"}`;
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-2 rounded-gm-card p-5",
        WARNING_LEVEL_SURFACE[copy.level]
      )}
      role="status"
    >
      <p className="flex items-center gap-2 font-bold font-gm-display text-gm-display uppercase tracking-wide">
        <StatusIcon aria-hidden="true" className="size-8 shrink-0" />
        {copy.headline}
      </p>
      <p className="max-w-prose text-body-base leading-body-base">
        {copy.guidance}
      </p>
      <p className="font-mono text-body-sm leading-body-sm">
        Last checked {CHECKED.format(checkedAt)} AST · CAP feed{" "}
        {alerts.status === "unavailable" ? "not responding" : "OK"}
        {greenNote}
      </p>
    </div>
  );
}
