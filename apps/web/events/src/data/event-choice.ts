import "server-only";

import { cookies } from "next/headers";
import type { ManagedEvent } from "@/domain/types";
import { type ShellEvent, shellEventOf } from "@/lib/dash-navigation";

/** Host-only, like `events_organiser`: the last event the member opened in the console. */
export const LISTING_COOKIE = "events_listing";

const LISTING_ID = /^[A-Za-z0-9_-]{1,100}$/u;

/** Remembers the event the member opened. Ids that are not well-formed are ignored. */
export async function rememberListing(listingId: string): Promise<void> {
  if (!LISTING_ID.test(listingId)) {
    return;
  }
  const store = await cookies();
  // Setting a cookie in an action re-renders the route; skip it when unchanged.
  if (store.get(LISTING_COOKIE)?.value === listingId) {
    return;
  }
  store.set(LISTING_COOKIE, listingId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
}

/**
 * The remembered event, but only if it is one of the organiser's listings
 * now (the organiser may have changed since). Null otherwise, so the nav falls
 * back to the event list.
 */
export async function rememberedEvent(
  listings: readonly ManagedEvent[]
): Promise<ShellEvent | null> {
  const value = (await cookies()).get(LISTING_COOKIE)?.value;
  if (!(value && LISTING_ID.test(value))) {
    return null;
  }
  const listing = listings.find((candidate) => candidate.id === value);
  return listing ? shellEventOf(listing) : null;
}
