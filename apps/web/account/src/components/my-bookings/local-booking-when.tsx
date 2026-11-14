"use client";

import { useSyncExternalStore } from "react";
import { formatBookingWhen } from "@/lib/booking-when";

const subscribe = () => () => undefined;

/**
 * A booking's day and times in the browser's zone. The server cannot know the
 * viewer's zone, so it renders the element empty and the text appears once the
 * page is hydrated (no wrong time is ever printed).
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
    () => null
  );
  return <time dateTime={startsAt}>{text}</time>;
}
