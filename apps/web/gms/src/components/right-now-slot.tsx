"use client";

import { RightNow } from "@/components/right-now";
import { useIsToday } from "@/components/today-only";
import type { WeatherSnapshot } from "@/lib/forecast-data";

/**
 * Keeps the MBIA observation slot in the weather card on every forecast day
 * (mobile and desktop) so it doesn't disappear when navigating days. Only
 * today's route has a real reading, so other days fall back to RightNow's
 * own "not available" state rather than repeating today's numbers beside
 * another day's forecast.
 */
export function RightNowSlot({
  observation,
}: {
  observation: WeatherSnapshot["observation"];
}) {
  const isToday = useIsToday();
  return <RightNow observation={isToday ? observation : null} />;
}
