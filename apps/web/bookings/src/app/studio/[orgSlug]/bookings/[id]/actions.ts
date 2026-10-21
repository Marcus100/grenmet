"use server";

// Booking actions for owners and admins. Every action re-checks the session
// and re-derives the organisation from the person's own list by slug; the
// browser supplies only the reason and the refund choice. FastAPI still
// enforces role and legal transitions and answers 403 / 409.

import { ResponseError } from "@barrelsgd/api-client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { reportError } from "@/lib/report-error";
import { getSession } from "@/lib/session";
import type { ActionState } from "@/lib/studio-action-state";
import {
  cancelBooking,
  confirmBooking,
  declineBooking,
  findOrganisation,
  markCompleted,
  markNoShow,
} from "@/lib/studio-api";
import {
  ADMIN_REQUIRED,
  actionFailure,
  type StudioFailure,
} from "@/lib/studio-errors";
import { canManageBookings, isUuid } from "@/lib/studio-view";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

const reasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Give a reason; the customer sees it in their email.")
    .max(300, "Keep the reason to 300 characters or fewer."),
});

const cancelSchema = reasonSchema.extend({
  // Present only when the form offered the refund choice (a deposit was taken).
  refundChoice: z.literal("1").optional(),
  refundDeposit: z.literal("on").optional(),
});

function fail(failure: StudioFailure): ActionState {
  return { status: "error", ...failure };
}

function invalid(message: string): ActionState {
  return fail({
    kind: "invalid",
    message,
    nextStep: "Fix it and try again.",
  });
}

type Call = (
  accessToken: string,
  organisationId: string,
  bookingId: string
) => Promise<unknown>;

/**
 * Session, organisation and role checks, then one API call. Anything the API
 * refuses becomes a typed result; a signed-out person goes to sign in.
 */
async function run(
  orgSlug: string,
  bookingId: string,
  done: string,
  call: Call
): Promise<ActionState> {
  const returnTo = `/studio/${orgSlug}/bookings/${bookingId}`;
  if (!(SLUG.test(orgSlug) && isUuid(bookingId))) {
    return fail({
      kind: "not_found",
      message: "We could not find that booking.",
      nextStep: "Go back to the agenda and choose again.",
    });
  }
  const session = await getSession();
  if (!session) {
    redirect(`/signin?${new URLSearchParams({ returnTo })}`);
  }
  try {
    const org = await findOrganisation(session.accessToken, orgSlug);
    if (!org) {
      return fail({
        kind: "not_found",
        message: "We could not find that business.",
        nextStep: "Go back to your businesses and choose again.",
      });
    }
    if (!canManageBookings(org.role)) {
      return fail(ADMIN_REQUIRED);
    }
    await call(session.accessToken, org.id, bookingId);
  } catch (error) {
    const failure = actionFailure(error);
    if (failure.kind === "signed_out") {
      redirect(`/signin?${new URLSearchParams({ returnTo })}`);
    }
    if (failure.kind === "conflict") {
      // The booking moved on: show its real status.
      refresh(orgSlug, bookingId);
    }
    if (!ResponseError.is(error) || error.status >= 500) {
      reportError(error, "studio");
    }
    return fail(failure);
  }
  refresh(orgSlug, bookingId);
  return { status: "done", message: done };
}

function refresh(orgSlug: string, bookingId: string) {
  revalidatePath(`/studio/${orgSlug}/agenda`);
  revalidatePath(`/studio/${orgSlug}/bookings/${bookingId}`);
}

export async function confirmBookingAction(
  orgSlug: string,
  bookingId: string
): Promise<ActionState> {
  return await run(orgSlug, bookingId, "Booking confirmed.", confirmBooking);
}

export async function noShowBookingAction(
  orgSlug: string,
  bookingId: string
): Promise<ActionState> {
  return await run(orgSlug, bookingId, "Marked as a no-show.", markNoShow);
}

export async function completeBookingAction(
  orgSlug: string,
  bookingId: string
): Promise<ActionState> {
  return await run(orgSlug, bookingId, "Marked as completed.", markCompleted);
}

export async function declineBookingAction(
  orgSlug: string,
  bookingId: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = reasonSchema.safeParse({ reason: formData.get("reason") });
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Give a reason.");
  }
  const { reason } = parsed.data;
  return await run(orgSlug, bookingId, "Request declined.", (token, org, id) =>
    declineBooking(token, org, id, reason)
  );
}

export async function cancelBookingAction(
  orgSlug: string,
  bookingId: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = cancelSchema.safeParse({
    reason: formData.get("reason"),
    refundChoice: formData.get("refundChoice") ?? undefined,
    refundDeposit: formData.get("refundDeposit") ?? undefined,
  });
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Give a reason.");
  }
  const { reason, refundChoice, refundDeposit } = parsed.data;
  // No choice offered: leave it out so the business's cutoff policy applies.
  const refund = refundChoice ? refundDeposit === "on" : undefined;
  return await run(orgSlug, bookingId, "Booking cancelled.", (token, org, id) =>
    cancelBooking(token, org, id, {
      reason,
      ...(refund === undefined ? {} : { refundDeposit: refund }),
    })
  );
}
