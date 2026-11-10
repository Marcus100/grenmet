import type { ProductKind } from "@barrelsgd/gms/products";
import { clock12 } from "@/lib/clock";
import {
  isOtherGrenadaDay,
  localDay,
  localTime,
  parseGrenadaTime,
} from "@/lib/current-conditions";
import { nextForecastDue } from "@/lib/desk-feed";

/**
 * Freshness rules for every public observation and forecast. One place owns
 * the limits and the wording, so a figure that is old reads as old on every
 * page. The limits come from the data's own timestamps (observed time, valid
 * to), never from when the page was loaded.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * A surface observation is stale after two hours. GMS SYNOP reports are hourly
 * (the MBIA observer and the automatic station), so a reading two hours old has
 * missed at least one report and is no longer the current conditions. The
 * earlier 90-minute limit flagged a normal late report as old.
 */
export const OBSERVATION_STALE_AFTER_MS = 2 * HOUR_MS;

/** A satellite image is stale after 30 minutes (foundations plan NFR). */
export const SATELLITE_STALE_AFTER_MS = 30 * MINUTE_MS;

/**
 * Used only when a forecast gives no valid-to time: a forecast issued more than
 * 12 hours ago may be out of date. A forecast with a valid-to time is judged by
 * that time alone (`forecastValidity`).
 */
export const FORECAST_ISSUED_FALLBACK_MS = 12 * HOUR_MS;

/**
 * A timestamp this far ahead of the server clock is not trusted, so it is
 * treated as old. Smaller gaps are clock drift between the observer's
 * system and the server, and count as fresh.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * MINUTE_MS;

/**
 * Milliseconds from `iso` to `now`: positive when `iso` is in the past,
 * negative when it is ahead. Null when there is no time or it cannot be read.
 */
export function ageMs(
  iso: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!iso) return null;
  const time = parseGrenadaTime(iso);
  return Number.isNaN(time) ? null : now.getTime() - time;
}

/** True when `iso` is older than `limitMs`, or cannot be trusted at all. */
function isOlderThan(
  iso: string | null | undefined,
  limitMs: number,
  now: Date
): boolean {
  const age = ageMs(iso, now);
  // Missing or unreadable is never presented as fresh.
  if (age === null) return true;
  if (age < -CLOCK_SKEW_TOLERANCE_MS) return true;
  return age > limitMs;
}

/** An observation is stale once it is more than two hours old. */
export function isStale(
  observedAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  return isOlderThan(observedAt, OBSERVATION_STALE_AFTER_MS, now);
}

export function isSatelliteStale(
  imagedAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  return isOlderThan(imagedAt, SATELLITE_STALE_AFTER_MS, now);
}

/** Whether a forecaster's issue time is too old to trust without a valid-to. */
export function isForecastIssueStale(
  issuedAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  return isOlderThan(issuedAt, FORECAST_ISSUED_FALLBACK_MS, now);
}

/**
 * A forecast's validity against its valid-to time. `expired` from the moment
 * of valid-to (the forecast runs up to, not including, that time). `unknown`
 * when the valid-to is missing or unreadable.
 */
export type ForecastValidity = "in-effect" | "expired" | "unknown";

export function forecastValidity(
  validTo: string | null | undefined,
  now: Date = new Date()
): ForecastValidity {
  const age = ageMs(validTo, now);
  if (age === null) return "unknown";
  return age >= 0 ? "expired" : "in-effect";
}

/** "11:00 a.m. AST", with the date first when it is another Grenada day. */
export function astTimeLabel(iso: string, now: Date = new Date()): string {
  const clock = `${clock12(localTime(iso))} AST`;
  return isOtherGrenadaDay(iso, now) ? `${localDay(iso)}, ${clock}` : clock;
}

/** "2 hours", "1 day": whole units, for "3 hours ago". */
function agoWords(ms: number): string {
  const hours = Math.floor(ms / HOUR_MS);
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

/**
 * The label for an observation, or null when it is fresh. Stale readings say
 * how long ago they were taken and when, in Grenada time: "Observed 3 hours
 * ago (11:00 a.m. AST) — older than usual". A time that cannot be checked says
 * so, and is never shown as current.
 */
export function observationNote(
  observedAt: string | null | undefined,
  now: Date = new Date()
): string | null {
  if (!observedAt) {
    return "Observation time not supplied, so treat this reading as older than usual.";
  }
  if (!isStale(observedAt, now)) return null;
  const age = ageMs(observedAt, now);
  if (age === null || age < 0) {
    return "Observation time could not be checked, so treat this reading as older than usual.";
  }
  return `Observed ${agoWords(age)} ago (${astTimeLabel(observedAt, now)}) — older than usual`;
}

/**
 * The label for a forecast or product that is no longer in effect, or null
 * while it is. An expired forecast names its next issue (from the public
 * issue times, or the product's own kind): "This forecast expired at 5:00 a.m.
 * AST; the next issue is due 7:00 a.m." Other products say to check for a
 * newer issue.
 */
export function validityNote(
  validTo: string | null | undefined,
  now: Date,
  options: { forecast: boolean; kinds?: readonly ProductKind[] }
): string | null {
  const validity = forecastValidity(validTo, now);
  if (validity === "in-effect") return null;
  if (validity === "unknown" || !validTo) {
    return "Validity time not supplied. Check for a newer issue.";
  }
  const at = astTimeLabel(validTo, now);
  if (!options.forecast) {
    return `This product expired at ${at}. Check for a newer issue.`;
  }
  const next = nextForecastDue(now, options.kinds);
  // "a.m." and "p.m." already end the sentence.
  const stop = next.endsWith(".") ? "" : ".";
  return `This forecast expired at ${at}; the next issue is due ${next}${stop}`;
}
