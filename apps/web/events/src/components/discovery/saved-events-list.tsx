"use client";

import Link from "next/link";
import { useSavedEvents } from "@/lib/saved-events";
import { EventCard, type EventCardData } from "./event-card";

/** Filters server-rendered cards down to this browser's saved events. */
export function SavedEventsList({
  events,
}: {
  events: readonly EventCardData[];
}) {
  const { saved } = useSavedEvents();
  const visible = events.filter((event) => saved.includes(event.slug));

  if (visible.length === 0) {
    return (
      <p className="rounded-2xl border border-border border-dashed p-6 text-center text-body text-muted-foreground">
        Nothing saved yet. Tap the bookmark on any event —{" "}
        <Link className="underline" href="/events">
          browse the calendar
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((event) => (
        <EventCard event={event} key={event.slug} />
      ))}
    </div>
  );
}
