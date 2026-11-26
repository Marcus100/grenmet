import "server-only";

import {
  type BookingListingQueue,
  bookingListingReviewListSchema,
  bookingListingReviewSchema,
} from "@barrelsgd/api-client";
import { authApiFetch } from "@barrelsgd/auth/server";
import { getAuthConfig } from "@/lib/auth-config";
import { LISTING_PAGE_SIZE } from "@/lib/bookings-listing-form";

// Bookings home page listing review (apps/api/fastapi/src/bookings/router.py,
// `/bookings/admin/listing-reviews*`). Every call needs `bookings.listing.approve`
// (superusers hold it); FastAPI re-checks it on each call and owns every state rule.

export function listListingReviews(
  accessToken: string,
  queue: BookingListingQueue,
  page: number
) {
  const params = new URLSearchParams({
    queue,
    page: String(page),
    size: String(LISTING_PAGE_SIZE),
  });
  return authApiFetch(
    getAuthConfig(),
    `/bookings/admin/listing-reviews?${params}`,
    bookingListingReviewListSchema,
    { accessToken }
  );
}

export function approveListing(accessToken: string, organisationId: string) {
  return authApiFetch(
    getAuthConfig(),
    `/bookings/admin/businesses/${encodeURIComponent(organisationId)}/listing/approve`,
    bookingListingReviewSchema,
    { accessToken, method: "POST" }
  );
}

export function withdrawListing(accessToken: string, organisationId: string) {
  return authApiFetch(
    getAuthConfig(),
    `/bookings/admin/businesses/${encodeURIComponent(organisationId)}/listing/withdraw`,
    bookingListingReviewSchema,
    { accessToken, method: "POST" }
  );
}
