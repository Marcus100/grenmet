"use client";

import type { ElectionCalendar } from "@/data/election-2026";
import { electionHeadline } from "@/data/election-2026";
import { useElectionNow } from "@/lib/browser-today";

/**
 * The 2026 page headline. Only the "date still to be announced" wording depends
 * on today, so the date-free fallback shows until the browser knows the date.
 */
export function ElectionHeadline({
  calendar,
  fallback,
}: {
  calendar: ElectionCalendar;
  fallback: string;
}) {
  const now = useElectionNow();
  return electionHeadline(calendar, now) ?? fallback;
}
