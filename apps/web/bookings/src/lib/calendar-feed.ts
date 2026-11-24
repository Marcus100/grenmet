// The business's calendar feed, for Settings > Calendar. The API returns the
// subscribed address once, when the link is made or reset, and keeps only a
// hash, so this app never stores it. Plain data and pure helpers only: safe to
// import from Client Components.

import type { FormState } from "@barrelsgd/ui/lib/form-state";
import type { StudioFailureKind } from "@/lib/studio-errors";

/** A create or reset result. `url` is present only on the success that made it. */
export type CalendarFeedState = FormState<
  { message: string; url?: string },
  { kind: StudioFailureKind; message: string; nextStep: string }
>;

export const CALENDAR_FEED_IDLE: CalendarFeedState = { status: "idle" };

const HTTP_SCHEME = /^https?:\/\//u;

/** The subscribe link for Apple Calendar and other apps: https (or http) becomes webcal. */
export function webcalUrl(url: string): string {
  return url.replace(HTTP_SCHEME, "webcal://");
}
