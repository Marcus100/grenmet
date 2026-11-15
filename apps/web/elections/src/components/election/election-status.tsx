"use client";

import type { ElectionCalendar } from "@/data/election-2026";
import { electionStatus } from "@/data/election-2026";
import { useElectionNow } from "@/lib/browser-today";

/**
 * The one-line state of the 2026 election ("Grenada votes in 12 days"), worked
 * out from the visitor's date. Until the browser knows the date, and with
 * JavaScript off, it renders `prefix` (if any) or `fallback`, which never claims
 * anything that depends on the day.
 */
export function ElectionStatus({
  calendar,
  prefix,
  fallback = null,
}: {
  calendar: ElectionCalendar;
  prefix?: string;
  fallback?: string | null;
}) {
  const now = useElectionNow();
  if (!now) return prefix ?? fallback;
  const status = electionStatus(calendar, now);
  return prefix ? `${prefix} · ${status}` : status;
}
