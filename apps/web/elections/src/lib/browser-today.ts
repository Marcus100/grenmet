import { useSyncExternalStore } from "react";
import { grenadaDate } from "@/data/election-2026";

/**
 * "Today" is worked out in the visitor's browser, because the site is a static
 * export: nothing on the server knows the date when a page is served. Only client
 * components may call these hooks. Until hydration (and with JavaScript off) they
 * return null, so callers render text that stays true on any day.
 */

const DAY_MS = 86_400_000;
/** Grenada is UTC−4 all year (no daylight saving), so its midnight is 04:00 UTC. */
const GRENADA_OFFSET_MS = 4 * 3_600_000;
/** A little after midnight, so the clock has certainly rolled over when the timer fires. */
const TIMER_MARGIN_MS = 1000;

/** Milliseconds from `now` (epoch ms) to the next Grenada midnight, plus a margin. */
export function msUntilNextGrenadaDay(now: number): number {
  const next =
    (Math.floor((now - GRENADA_OFFSET_MS) / DAY_MS) + 1) * DAY_MS +
    GRENADA_OFFSET_MS;
  return next - now + TIMER_MARGIN_MS;
}

/**
 * Noon UTC on a Grenada calendar date. It is 08:00 in Grenada, so
 * `grenadaDate(grenadaNoon(iso)) === iso` and the date maths in
 * election-2026.ts gives the same answer as for the real instant.
 */
export function grenadaNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/**
 * Re-check the date when the tab regains focus or visibility, and at each
 * Grenada midnight, so a page left open overnight does not show yesterday.
 */
function subscribe(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    timer = setTimeout(() => {
      onChange();
      arm();
    }, msUntilNextGrenadaDay(Date.now()));
  };
  arm();
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearTimeout(timer);
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}

/**
 * Today's date in Grenada as YYYY-MM-DD, from the browser's clock; null on the
 * server, during hydration and when JavaScript is off. The snapshot is a string,
 * so React re-renders only when the Grenada date actually changes.
 */
export function useGrenadaToday(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => grenadaDate(new Date()),
    () => null
  );
}

/** A Date that falls on today's Grenada date, or null until the browser knows it. */
export function useElectionNow(): Date | null {
  const today = useGrenadaToday();
  return today ? grenadaNoon(today) : null;
}
