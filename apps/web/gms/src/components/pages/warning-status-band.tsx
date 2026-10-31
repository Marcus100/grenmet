import { ShieldCheckIcon, TriangleAlertIcon } from "lucide-react";
import {
  type AlertsResult,
  alertsLevel,
  alertsSummary,
  type GreenStatus,
} from "@/lib/cap-alerts";
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
 * What the band says. "No active alerts" is said only when no warning is in
 * effect and the GMS outlook is read in full with nothing in effect. Anything
 * in effect is named, and an unread or incomplete outlook is never an all-clear.
 */
function bandCopy(alerts: AlertsResult, green?: GreenStatus): BandCopy {
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
  if (alerts.status === "ok" && alerts.activeCount > 0) {
    // Warnings listed, none at the CAP levels (for example an exercise).
    return {
      headline: alertsSummary(alerts),
      guidance: WARNING_LEVEL_GUIDANCE["be-aware"],
      level: "be-aware",
      allClear: false,
      unavailable: false,
    };
  }
  if (!green) {
    return {
      headline: "No warnings or watches",
      guidance:
        "This is not an all-clear. The GMS alerts could not be checked right now.",
      level: "unknown",
      allClear: false,
      unavailable: true,
    };
  }
  if (green.status === "unavailable") {
    return {
      headline: "No warnings or watches",
      guidance:
        "This is not an all-clear. The Green alerts could not be checked right now. Check the Grenada Meteorological Service directly.",
      level: "unknown",
      allClear: false,
      unavailable: true,
    };
  }
  if (green.other > 0) {
    return {
      headline: alertsSummary(alerts, green),
      guidance:
        "GMS alerts are in effect that are not yet listed as warnings. Check the Grenada Meteorological Service directly.",
      level: "unknown",
      allClear: false,
      unavailable: false,
    };
  }
  if (!green.complete && green.count === 0) {
    return {
      headline: alertsSummary(alerts, green),
      guidance:
        "This is not an all-clear. Some alerts could not be read. Check the Grenada Meteorological Service directly.",
      level: "unknown",
      allClear: false,
      unavailable: false,
    };
  }
  if (green.count > 0) {
    return {
      headline: `Green level · ${green.count} active`,
      guidance: green.complete
        ? "Green is the lowest level. The Green alerts below are listed for awareness."
        : "Green is the lowest level. Some alerts could not be read, so this list may be incomplete.",
      // An incomplete read is grey, never the calm colour (the label stays).
      level: green.complete ? "none" : "unknown",
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
 * The note on the band's status line about the GMS outlook read: incomplete,
 * other GMS alerts in effect, or OK. Empty when the band has no outlook answer.
 */
function greenNoteFor(green: GreenStatus | undefined): string {
  if (green === undefined) {
    return "";
  }
  if (green.status === "unavailable") {
    return " · Green alerts not responding";
  }
  if (!green.complete) {
    return " · Green alerts incomplete";
  }
  if (green.other > 0) {
    return " · other GMS alerts in effect";
  }
  return " · Green alerts OK";
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
  green?: GreenStatus;
}) {
  const copy = bandCopy(alerts, green);
  const StatusIcon = copy.allClear ? ShieldCheckIcon : TriangleAlertIcon;
  const greenNote = greenNoteFor(green);
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
