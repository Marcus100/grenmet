"use client";

import { useEffect } from "react";
import { rememberEventChoice } from "@/data/actions";
import { reportError } from "@/lib/report-error";

/**
 * Tells the server which event the member has open, so the organiser nav can
 * link the event screens to it from the overview, events and team pages.
 * Cookies cannot be set while a Server Component renders, hence this effect.
 */
export function RememberEvent({ listingId }: { listingId: string }) {
  useEffect(() => {
    rememberEventChoice(listingId).catch((error: unknown) => {
      reportError(error, "events-dash-nav");
    });
  }, [listingId]);
  return null;
}
