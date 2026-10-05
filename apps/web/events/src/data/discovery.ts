import { isCategory, isParish } from "@/domain/labels";
import type { EventFilters, PublicEvent } from "@/domain/types";
import { addDaysToKey, grenadaDateKey, grenadaWeekday } from "@/lib/datetime";

/**
 * Pure helpers for public discovery: date windows, grouping and filter
 * parsing. Data itself comes from `./events-api` (server-only).
 */

const FRIDAY = 5;
const SUNDAY = 0;

/** True when the event is on today's Grenada date and has not ended. */
export function isTonight(event: PublicEvent, now: Date): boolean {
  return (
    grenadaDateKey(event.startsAt) === grenadaDateKey(now) &&
    new Date(event.endsAt) > now
  );
}

/**
 * The Friday–Sunday window this weekend, as Grenada date keys. On a weekend
 * day it starts today; Monday–Thursday it is the coming weekend.
 */
export function weekendWindow(now: Date): { end: string; start: string } {
  const today = grenadaDateKey(now);
  const weekday = grenadaWeekday(now);

  if (weekday === SUNDAY) {
    return { start: today, end: today };
  }
  if (weekday >= FRIDAY) {
    return { start: today, end: addDaysToKey(today, 7 - weekday) };
  }
  const start = addDaysToKey(today, FRIDAY - weekday);
  return { start, end: addDaysToKey(start, 2) };
}

export function isThisWeekend(event: PublicEvent, now: Date): boolean {
  const { start, end } = weekendWindow(now);
  const key = grenadaDateKey(event.startsAt);
  return key >= start && key <= end && new Date(event.endsAt) > now;
}

export interface DayGroup {
  readonly events: readonly PublicEvent[];
  readonly key: string;
}

/** Groups sorted events by their Grenada calendar date. */
export function groupByDay(events: readonly PublicEvent[]): DayGroup[] {
  const groups = new Map<string, PublicEvent[]>();
  for (const event of events) {
    const key = grenadaDateKey(event.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return [...groups.entries()].map(([key, dayEvents]) => ({
    key,
    events: dayEvents,
  }));
}

/** Reads untrusted search params into typed filters, dropping unknown values. */
export function parseFilters(
  params: Record<string, string | string[] | undefined>
): EventFilters {
  const one = (name: string): string | undefined => {
    const value = params[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const when = one("when");
  const price = one("price");
  const category = one("category");
  const parish = one("parish");
  const query = one("q");

  return {
    ...(isCategory(category) ? { category } : {}),
    ...(isParish(parish) ? { parish } : {}),
    ...(price === "free" || price === "paid" ? { price } : {}),
    ...(when === "tonight" ||
    when === "weekend" ||
    when === "week" ||
    when === "month"
      ? { when }
      : {}),
    ...(query ? { query: query.slice(0, 100) } : {}),
  };
}
