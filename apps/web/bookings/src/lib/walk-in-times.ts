// Open start times for a walk-in or phone booking, read from the public
// availability answer. Pure: the server action fetches, the form draws.

import {
  formatTime,
  localDay,
} from "@barrelsgd/bookings-web/lib/booking-format";
import { localTime } from "@/lib/studio-view";

export interface WalkInTime {
  /** The same instant in words for the chip, like "9:30 AM". */
  label: string;
  /** "HH:MM" on the business clock: the value the time field takes. */
  time: string;
}

/**
 * The open times that fall on `day` (YYYY-MM-DD, the business's own calendar),
 * earliest first, one per start time. The API answers a 14-day window, so the
 * other days are dropped here.
 */
export function walkInTimes(
  slots: readonly { starts_at: string }[],
  zone: string,
  day: string
): WalkInTime[] {
  const byTime = new Map<string, WalkInTime>();
  for (const slot of slots) {
    if (localDay(slot.starts_at, zone) !== day) {
      continue;
    }
    const time = localTime(slot.starts_at, zone);
    if (!byTime.has(time)) {
      byTime.set(time, { time, label: formatTime(slot.starts_at, zone) });
    }
  }
  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
}

/** The service's name and a search over its name and category, both ignoring case. */
export function matchesServiceSearch(
  service: { name: string; category: string | null },
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return true;
  }
  return (
    service.name.toLowerCase().includes(needle) ||
    (service.category ?? "").toLowerCase().includes(needle)
  );
}
