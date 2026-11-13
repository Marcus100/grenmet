import { FreshnessNotice } from "@/components/freshness-notice";
import { localDateTime, parseGrenadaTime } from "@/lib/current-conditions";
import {
  isForecastIssueStale,
  isSatelliteStale,
  observationNote,
  validityNote,
} from "@/lib/freshness";
import { cn } from "@/lib/utils";

export type ProvenanceKind = "forecast" | "observation" | "satellite";
export type ProvenanceStatus = "external" | "provisional" | "verified";

const TIME_LABEL: Record<ProvenanceKind, string> = {
  forecast: "Issued",
  observation: "Observed",
  satellite: "Imaged",
};
const STATUS_LABEL: Record<ProvenanceStatus, string> = {
  external: "External source",
  provisional: "Provisional, not yet quality checked",
  verified: "Verified",
};
const OBSERVATION_LAST_REPORT =
  "It is the last report received, not current conditions.";
const FORECAST_ISSUE_STALE =
  "This forecast was issued more than 12 hours ago and may be out of date. Check for a newer issue.";
const SATELLITE_STALE =
  "This image is more than 30 minutes old. It is the last image received, not the current view.";

/**
 * Where a figure or image came from, when, and how far to trust it. Every
 * public data block carries one (foundations plan: source, time, status). An
 * old product says so in words, never only in colour, and the wording comes
 * from `@/lib/freshness`. An `external` source is not a GMS product and says
 * that too.
 */
export function Provenance({
  kind,
  now = new Date(),
  source,
  status,
  showTime = true,
  time,
  tone = "default",
  validTo,
}: {
  kind: ProvenanceKind;
  /** Clock for the stale check; defaults to the render time. */
  now?: Date;
  source: string;
  status: ProvenanceStatus;
  /**
   * Set false when the surrounding block already states the time (the sky
   * hero's top line). The stale warning still shows when the time is old.
   */
  showTime?: boolean;
  /** Observation, issue or image time; ISO, or a Grenada wall-clock time. */
  time: string;
  /** "inverse" for text on the dark sky hero. */
  tone?: "default" | "inverse";
  /**
   * A forecast's valid-to time. When given, the forecast is judged by it alone;
   * when omitted, a forecast is flagged after 12 hours since issue.
   */
  validTo?: string | null;
}) {
  const known = !Number.isNaN(parseGrenadaTime(time));
  let note: string | null = null;
  if (kind === "observation") {
    const reading = observationNote(time, now);
    note = reading && `${reading} ${OBSERVATION_LAST_REPORT}`;
  } else if (kind === "forecast") {
    if (validTo !== undefined) {
      note = validityNote(validTo, now, { forecast: true });
    } else if (isForecastIssueStale(time, now)) {
      note = FORECAST_ISSUE_STALE;
    }
  } else if (isSatelliteStale(time, now)) {
    note = SATELLITE_STALE;
  }
  const timeLabel =
    note && kind === "observation" ? "Last observed" : TIME_LABEL[kind];
  return (
    <div
      className={cn(
        "text-body-sm leading-body-sm grid gap-1",
        tone === "inverse"
          ? "text-gm-text-inverse/85"
          : "text-gm-text-secondary my-3"
      )}
    >
      <p>
        <span className="font-semibold">Source:</span> {source}
        {showTime && (
          <>
            {" · "}
            <span className="font-semibold">{timeLabel}:</span>{" "}
            {known ? localDateTime(time) : "time unknown"}
          </>
        )}
        {" · "}
        <span className="font-semibold">Status:</span> {STATUS_LABEL[status]}
        {status === "external" && " · Not a GMS product"}
      </p>
      {note && (
        <FreshnessNotice
          message={note}
          tone={tone === "inverse" ? "sky" : "light"}
        />
      )}
    </div>
  );
}
