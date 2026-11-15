"use client";

import { useSyncExternalStore } from "react";
import { formatBookingWhen } from "@/lib/booking-when";

const subscribe = () => () => undefined;

/**
 * A booking's day and times. Before the browser has loaded (server render, no
 * JavaScript) it shows the same times in UTC with a "UTC" label, so no reader
 * sees an empty element. After hydration it switches to the viewer's own zone.
 * The server snapshot is what React uses while hydrating, so the markup matches.
 */
export function LocalBookingWhen({
  startsAt,
  endsAt,
}: {
  startsAt: string;
  endsAt: string;
}) {
  const text = useSyncExternalStore(
    subscribe,
    () => formatBookingWhen(startsAt, endsAt),
    () => formatBookingWhen(startsAt, endsAt, "UTC")
  );
  return <time dateTime={startsAt}>{text}</time>;
}
