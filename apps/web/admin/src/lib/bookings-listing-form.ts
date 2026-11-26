// Bookings home page listing review: queue parsing, the fixed wording for each
// outcome and the mapping of API refusals to notice codes. FastAPI owns every
// rule (apps/api/fastapi/src/bookings/listing_review.py); this file only
// validates shapes and turns refusals into readable text.

import type { BookingListingQueue } from "@barrelsgd/api-client";

export const LISTING_QUEUES: readonly BookingListingQueue[] = [
  "pending",
  "approved",
  "flagged",
  "all",
];

export const LISTING_PAGE_SIZE = 25;

export const LISTING_QUEUE_LABEL: Record<BookingListingQueue, string> = {
  pending: "Waiting",
  approved: "Approved",
  flagged: "Flagged",
  all: "All",
};

export function parseListingQueue(
  value: string | undefined
): BookingListingQueue {
  return LISTING_QUEUES.find((item) => item === value) ?? "pending";
}

export const LISTING_EMPTY: Record<
  BookingListingQueue,
  { text: string; title: string }
> = {
  pending: {
    title: "No listings waiting",
    text: "Businesses that ask to appear on the Bookings home page wait here, oldest first. There are none right now.",
  },
  approved: {
    title: "No listings approved yet",
    text: "Approved businesses appear here and on the Bookings home page. Switch to Waiting to see requests.",
  },
  flagged: {
    title: "Nothing is flagged",
    text: "Businesses whose owner left, or whose sign-up name was refused for looking like an email address, appear here.",
  },
  all: {
    title: "No businesses yet",
    text: "Businesses appear here once they set up a Bookings page.",
  },
};

export type ListingAction = "approve" | "withdraw";

export type ListingNoticeCode =
  | "approved"
  | "withdrawn"
  | "already-approved"
  | "not-approved"
  | "forbidden"
  | "missing"
  | "invalid"
  | "throttled"
  | "failed";

interface Notice {
  text: string;
  tone: "ok" | "problem";
}

export const LISTING_NOTICES: Record<ListingNoticeCode, Notice> = {
  approved: {
    tone: "ok",
    text: "Approved. This business now appears on the Bookings home page. Its booking page works by its link either way.",
  },
  withdrawn: {
    tone: "ok",
    text: "Approval withdrawn. This business is off the Bookings home page. Its booking page still works by its link.",
  },
  "already-approved": {
    tone: "problem",
    text: "This listing is already approved. Nothing was changed; the list below is current.",
  },
  "not-approved": {
    tone: "problem",
    text: "This listing is not approved, so there is nothing to withdraw. Nothing was changed; the list below is current.",
  },
  forbidden: {
    tone: "problem",
    text: "You don't have access to decide listings. The listing permission is needed for approving and withdrawing.",
  },
  missing: {
    tone: "problem",
    text: "That business was not found. Reload the list to see the current businesses.",
  },
  invalid: {
    tone: "problem",
    text: "That business could not be identified. Reload the list and try again.",
  },
  throttled: {
    tone: "problem",
    text: "Too many requests. Wait a moment and try again.",
  },
  failed: {
    tone: "problem",
    text: "The change could not be completed and may not have been saved. Reload the list to see the current state before trying again.",
  },
};

export function listingNoticeFor(code: string | undefined): Notice | undefined {
  return code && Object.hasOwn(LISTING_NOTICES, code)
    ? LISTING_NOTICES[code as ListingNoticeCode]
    : undefined;
}

/**
 * Map an API refusal from approve or withdraw to a notice. `known` is false
 * when the failure should be reported as an incident; expected refusals are not.
 * 409 means the state already matches (approved twice, or withdrawn while not
 * approved), never a retry.
 */
export function listingNoticeForError(
  action: ListingAction,
  status: number
): { code: ListingNoticeCode; known: boolean } {
  switch (status) {
    case 403:
      return { code: "forbidden", known: true };
    case 404:
      return { code: "missing", known: true };
    case 409:
      return {
        code: action === "approve" ? "already-approved" : "not-approved",
        known: true,
      };
    case 422:
    case 400:
      return { code: "invalid", known: true };
    case 429:
      return { code: "throttled", known: true };
    default:
      return { code: "failed", known: false };
  }
}

export const LISTING_NOTICE_OK: Record<ListingAction, ListingNoticeCode> = {
  approve: "approved",
  withdraw: "withdrawn",
};
