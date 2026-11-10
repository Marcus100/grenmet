import type { ManagedListing } from "@barrelsgd/api-client";

export type ListingBadgeStatus = ManagedListing["status"];

/** The organiser's badge for each listing status the API sends. */
export const LISTING_STATUS_BADGE: Record<
  ListingBadgeStatus,
  { label: string; variant: "light-light" | "light-success" | "light-warning" }
> = {
  cancelled: { label: "Cancelled", variant: "light-light" },
  draft: { label: "Draft", variant: "light-warning" },
  published: { label: "Published", variant: "light-success" },
};
