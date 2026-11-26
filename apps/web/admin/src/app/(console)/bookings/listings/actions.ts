"use server";

import { isAuthApiError } from "@barrelsgd/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { approveListing, withdrawListing } from "@/lib/bookings-listing-api";
import {
  LISTING_NOTICE_OK,
  type ListingAction,
  listingNoticeForError,
  listingsHref,
  parseListingPage,
  parseListingQueue,
} from "@/lib/bookings-listing-form";
import { parseOrganisationId } from "@/lib/organisation-form";
import { reportError } from "@/lib/report-error";
import { requireGate } from "@/lib/staff-gate";

// Re-check the staff gate, validate the business id and queue, proxy to FastAPI
// (which re-checks the listing permission and owns every state rule). Every
// outcome redirects back to the list with a fixed `?notice=` code, so the page
// reloads with the current state. Decisions are transitions: a repeat is a 409,
// never a retry. The confirm dialog closes itself after the redirect.

const LISTING_PATH = "/bookings/listings";

async function decide(
  action: ListingAction,
  formData: FormData
): Promise<void> {
  const queue = parseListingQueue(String(formData.get("queue") ?? ""));
  // The page the staff member was on; the redirect returns there, or to the
  // last page if the change emptied it.
  const page = parseListingPage(String(formData.get("page") ?? ""));
  const organisationId = parseOrganisationId(
    String(formData.get("organisation_id") ?? "")
  );
  if (!organisationId) redirect(listingsHref(queue, page, "invalid"));

  const gate = await requireGate(LISTING_PATH);
  if (gate.status !== "staff") redirect("/");

  try {
    if (action === "approve") {
      await approveListing(gate.accessToken, organisationId);
    } else {
      await withdrawListing(gate.accessToken, organisationId);
    }
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status === 401) redirect("/signin?sign_in=expired");
    const mapped = listingNoticeForError(action, error.status);
    // Expected refusals are not incidents; anything else is reported.
    if (!mapped.known) reportError(error, "admin-bookings-listings");
    revalidatePath(LISTING_PATH);
    redirect(listingsHref(queue, page, mapped.code));
  }
  revalidatePath(LISTING_PATH);
  redirect(listingsHref(queue, page, LISTING_NOTICE_OK[action]));
}

export async function approveListingAction(formData: FormData): Promise<void> {
  await decide("approve", formData);
}

export async function withdrawListingAction(formData: FormData): Promise<void> {
  await decide("withdraw", formData);
}
