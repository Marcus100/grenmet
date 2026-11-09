import "server-only";

import { type TidesResponse, tidesResponseSchema } from "@barrelsgd/api-client";
import { cache } from "react";
import { endpoint } from "@/lib/products";
import { reportError } from "@/lib/report-error";

/** Prickly Bay, the only tide station the almanac publishes. */
export const TIDE_STATION = "pric";
/** The tides page shows today and the next six days (seven in all). */
export const TIDE_DAYS = 7;

export type TidesResult =
  | { status: "ok"; tides: TidesResponse }
  | { status: "unavailable" };

/** Tide predictions change daily at most: the page reuses an answer for an hour. */
const TIDES_REVALIDATE_SECONDS = 3600;

const requestOptions = () => ({
  // Data Cache, not `no-store`: the other GMS reads are live; tides are not.
  next: { revalidate: TIDES_REVALIDATE_SECONDS },
  credentials: "omit" as const,
  redirect: "error" as const,
  signal: AbortSignal.timeout(5000),
});

/** The Grenada calendar day (`YYYY-MM-DD`) of an instant. */
export function grenadaDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Grenada",
    year: "numeric",
  }).format(now);
}

/** Calendar days from `start` (inclusive), `count` of them, as `YYYY-MM-DD`. */
export function dayRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(`${start}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

/**
 * Predicted high and low tides for the Grenada days in `[from, to]`. Never
 * rejects: an unreadable answer is `unavailable`, which the page says in words,
 * never as "no tides".
 */
export const fetchPublicTides = cache(async function fetchPublicTides(
  from: string,
  to: string
): Promise<TidesResult> {
  try {
    const url = endpoint("tides", "almanac");
    url.searchParams.set("station", TIDE_STATION);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    const response = await fetch(url, requestOptions());
    if (!response.ok) return { status: "unavailable" };
    const parsed = tidesResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      reportError(parsed.error, "gms-tides-contract");
      return { status: "unavailable" };
    }
    return { status: "ok", tides: parsed.data };
  } catch (error) {
    reportError(error, "gms-tides");
    return { status: "unavailable" };
  }
});
