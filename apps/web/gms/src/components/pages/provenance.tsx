import {
  FORECAST_STALE_AFTER_MS,
  localDateTime,
  parseGrenadaTime,
  SATELLITE_STALE_AFTER_MS,
  STALE_AFTER_MS,
} from "@/lib/current-conditions";
import { cn } from "@/lib/utils";

export type ProvenanceKind = "forecast" | "observation" | "satellite";
export type ProvenanceStatus = "external" | "provisional" | "verified";

const LIMITS: Record<ProvenanceKind, number> = {
  forecast: FORECAST_STALE_AFTER_MS,
  observation: STALE_AFTER_MS,
  satellite: SATELLITE_STALE_AFTER_MS,
};
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
const STALE_TEXT: Record<ProvenanceKind, string> = {
  forecast:
    "This forecast was issued more than 12 hours ago and may be out of date. Check for a newer issue.",
  observation:
    "This reading is more than 90 minutes old. It is the last report received, not current conditions.",
  satellite:
    "This image is more than 30 minutes old. It is the last image received, not the current view.",
};

/**
 * Where a figure or image came from, when, and how far to trust it. Every
 * public data block carries one (foundations plan: source, time, status). An
 * old product says so in words, never only in colour. An `external` source is
 * not a GMS product and says that too.
 */
export function Provenance({
  kind,
  now = new Date(),
  source,
  status,
  showTime = true,
  time,
  tone = "default",
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
}) {
  const parsed = parseGrenadaTime(time);
  const known = !Number.isNaN(parsed);
  const stale = !known || now.getTime() - parsed > LIMITS[kind];
  const timeLabel =
    stale && kind === "observation" ? "Last observed" : TIME_LABEL[kind];
  return (
    <div
      className={cn(
        "grid gap-1 text-body-sm leading-body-sm",
        tone === "inverse"
          ? "text-gm-text-inverse/85"
          : "my-3 text-gm-text-secondary"
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
      {stale && (
        <p
          className={cn(
            "rounded border-gm-risk-yellow border-l-4 px-3 py-2 font-semibold",
            tone === "inverse"
              ? "bg-gm-scrim text-gm-text-inverse"
              : "bg-gm-surface text-gm-heading"
          )}
          role="status"
        >
          {STALE_TEXT[kind]}
        </p>
      )}
    </div>
  );
}
