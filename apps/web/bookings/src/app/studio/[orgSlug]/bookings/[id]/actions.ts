"use server";

// Booking actions for owners and admins. Every action re-checks the session
// and re-derives the organisation from the person's own list by slug; the
// browser supplies only the reason and the refund choice. FastAPI still
// enforces role and legal transitions and answers 403 / 409.

import {
  type BookingStudioDetail,
  manualMethod,
  ResponseError,
} from "@barrelsgd/api-client";
import { codeOf } from "@barrelsgd/bookings-web/lib/booking-errors";
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
  getBusinessTimezone,
  markCompleted,
  markDepositReceived,
  markNoShow,
  recordManualDeposit,
  rescheduleBooking,
  undoDepositReceived,
} from "@/lib/studio-api";
import {
  ADMIN_REQUIRED,
  actionFailure,
  type StudioFailure,
} from "@/lib/studio-errors";
import {
  canManageBookings,
  DEPOSIT_METHODS,
  isDay,
  isTime,
  isUuid,
  parseLocalWhen,
  zonedToUtcIso,
} from "@/lib/studio-view";

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/u;

const reasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Give a reason; the customer sees it in their email.")
    .max(300, "Keep the reason to 300 characters or fewer."),
});

const cancelSchema = reasonSchema.extend({
  // Offered only when there is a deposit left to refund. Absent or "policy":
  // leave refund_deposit out so the business's cancellation cutoff decides.
  refundChoice: z.enum(["policy", "refund", "keep"]).optional(),
});

const rescheduleSchema = z.object({
  date: z.string().refine(isDay, "Choose a date."),
  time: z.string().refine(isTime, "Choose a start time."),
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
) => Promise<BookingStudioDetail>;

/**
 * Session, organisation and role checks, then one API call. Anything the API
 * refuses becomes a typed result; a signed-out person goes to sign in.
 */
async function run(
  orgSlug: string,
  bookingId: string,
  done: string,
  call: Call,
  options: {
    /** Words the API's refusal; null leaves it to the shared wording. */
    failure?: (error: unknown) => StudioFailure | null;
    warnOnFailedRefund?: boolean;
  } = {}
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
  let detail: BookingStudioDetail;
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
    detail = await call(session.accessToken, org.id, bookingId);
  } catch (error) {
    const failure = options.failure?.(error) ?? actionFailure(error);
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
  if (options.warnOnFailedRefund && refundFailed(detail)) {
    return {
      status: "success",
      warning: true,
      message: `${done} The deposit refund failed; refund it by hand.`,
    };
  }
  return { status: "success", message: done };
}

/** The API records a failed refund as a timeline note on the cancelled booking. */
function refundFailed(detail: BookingStudioDetail): boolean {
  return detail.events.some((event) =>
    event.note?.toLowerCase().includes("refund failed")
  );
}

function refresh(orgSlug: string, bookingId: string) {
  // The shell's "waiting to be confirmed" count lives in the business layout.
  revalidatePath(`/studio/${orgSlug}`, "layout");
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

/** A move the API refused: a clash is the common case, so say so. */
function rescheduleFailure(error: unknown): StudioFailure | null {
  if (ResponseError.is(error) && error.status === 409) {
    return {
      kind: "conflict",
      message: "That time is not free, or the booking has changed.",
      nextStep:
        "Choose another time. The page has refreshed; check the booking's status.",
    };
  }
  if (ResponseError.is(error) && error.status === 422) {
    return {
      kind: "invalid",
      message: "That time was not accepted. It must be in the future.",
      nextStep: "Choose a later date or time.",
    };
  }
  return null;
}

export async function rescheduleBookingAction(
  orgSlug: string,
  bookingId: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = rescheduleSchema.safeParse({
    date: formData.get("date") ?? "",
    time: formData.get("time") ?? "",
  });
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Choose a new time.");
  }
  const { date, time } = parsed.data;
  return await run(
    orgSlug,
    bookingId,
    "Booking moved. The customer has been emailed.",
    async (token, org, id) =>
      rescheduleBooking(
        token,
        org,
        id,
        // The wall-clock time is read on the business's own clock, fetched here.
        zonedToUtcIso(date, time, await getBusinessTimezone(token, org))
      ),
    { failure: rescheduleFailure }
  );
}

export async function declineBookingAction(
  orgSlug: string,
  bookingId: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = reasonSchema.safeParse({
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Give a reason.");
  }
  const { reason } = parsed.data;
  return await run(
    orgSlug,
    bookingId,
    "Request declined.",
    (token, org, id) => declineBooking(token, org, id, reason),
    { warnOnFailedRefund: true }
  );
}

export async function cancelBookingAction(
  orgSlug: string,
  bookingId: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = cancelSchema.safeParse({
    reason: formData.get("reason") ?? "",
    refundChoice: formData.get("refundChoice") ?? undefined,
  });
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Give a reason.");
  }
  const { reason, refundChoice } = parsed.data;
  // Policy (the default) or no choice offered: leave it out so the business's
  // cutoff decides. Only an explicit choice overrides it.
  let refund: boolean | undefined;
  if (refundChoice === "refund") {
    refund = true;
  } else if (refundChoice === "keep") {
    refund = false;
  }
  return await run(
    orgSlug,
    bookingId,
    "Booking cancelled.",
    (token, org, id) =>
      cancelBooking(token, org, id, {
        reason,
        ...(refund === undefined ? {} : { refundDeposit: refund }),
      }),
    { warnOnFailedRefund: true }
  );
}

// --- recording a deposit taken by hand -----------------------------------------
// Money-adjacent: the amount is never read from the browser. The API takes the
// booking's own deposit; the form supplies only the method, an optional
// reference and an idempotency key.

const depositSchema = z.object({
  method: z.enum(manualMethod, {
    error: "Choose how the deposit was paid.",
  }),
  reference: z
    .string()
    .trim()
    .max(200, "Keep the reference to 200 characters or fewer."),
  idempotencyKey: z.string().refine(isUuid, "Reload the page and try again."),
});

const IDEMPOTENCY_409 = /idempotency|still being processed/iu;
const IN_PROGRESS_409 = /still being processed/iu;
const ENTITLEMENT_403 = /entitle/iu;

function detailText(data: unknown): string {
  try {
    return typeof data === "string" ? data : (JSON.stringify(data) ?? "");
  } catch {
    return "";
  }
}

const DEPOSIT_409: { match: RegExp; message: string; nextStep: string }[] = [
  {
    match: /different request/iu,
    message: "That save is out of step with an earlier attempt.",
    nextStep: "Press Record deposit again.",
  },
  {
    match: /no deposit/iu,
    message: "This booking has no deposit to record.",
    nextStep: "Check the booking's price and deposit.",
  },
  {
    match: /closed booking/iu,
    message: "This booking is closed, so it cannot take a deposit.",
    nextStep: "Check the booking's status.",
  },
  {
    match: /already been paid/iu,
    message: "The deposit has already been paid.",
    nextStep: "The page has refreshed; it shows the payment.",
  },
  {
    match: /failed or expired/iu,
    message: "The customer's card payment failed or expired.",
    nextStep:
      "It cannot be recorded by hand. The customer needs to book again.",
  },
  {
    match: /paid online|expire or fail/iu,
    message: "The customer's card payment is still open.",
    nextStep:
      "Wait for it to expire or fail (up to 30 minutes), then record the deposit by hand.",
  },
];

function depositFailure(error: unknown): StudioFailure {
  if (ResponseError.is(error)) {
    const text = detailText(error.data);
    if (error.status === 403 && ENTITLEMENT_403.test(text)) {
      return {
        kind: "forbidden",
        message: "This business isn't set up for this feature.",
        nextStep: "Ask Barrels support.",
      };
    }
    if (error.status === 409) {
      if (IN_PROGRESS_409.test(text)) {
        // "unavailable" keeps the key, so the retry replays the first result.
        return {
          kind: "unavailable",
          message: "The earlier attempt is still being processed.",
          nextStep: "Wait a moment, then press Record deposit again.",
        };
      }
      const known = DEPOSIT_409.find((item) => item.match.test(text));
      if (known) {
        return {
          kind: "conflict",
          message: known.message,
          nextStep: known.nextStep,
        };
      }
      return {
        kind: "conflict",
        message: "The deposit could not be recorded by hand.",
        nextStep:
          "Check the booking's deposit and contact support if it keeps happening.",
      };
    }
    if (error.status === 400 || error.status === 422) {
      return {
        kind: "invalid",
        message: "The deposit was not accepted.",
        nextStep: "Check the method and reference, then try again.",
      };
    }
  }
  return actionFailure(error);
}

export async function recordDepositAction(
  orgSlug: string,
  bookingId: string,
  _previous: ActionState,
  formData: FormData
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
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const parsed = depositSchema.safeParse({
    method: text("method"),
    reference: text("reference"),
    idempotencyKey: text("idempotencyKey"),
  });
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const input = parsed.data;
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
    await recordManualDeposit(
      session.accessToken,
      org.id,
      bookingId,
      input.idempotencyKey,
      { method: input.method, reference: input.reference }
    );
  } catch (error) {
    const failure = depositFailure(error);
    if (failure.kind === "signed_out") {
      redirect(`/signin?${new URLSearchParams({ returnTo })}`);
    }
    if (
      failure.kind === "conflict" &&
      !(ResponseError.is(error) && IDEMPOTENCY_409.test(detailText(error.data)))
    ) {
      refresh(orgSlug, bookingId);
    }
    if (!ResponseError.is(error) || error.status >= 500) {
      reportError(error, "studio");
    }
    return fail(failure);
  }
  refresh(orgSlug, bookingId);
  return { status: "success", message: "Deposit recorded." };
}

// --- a deposit paid to the business, marked received (#1869) ---------------------
// No money moves through Barrels: the form says how and when it arrived. The
// amount is the booking's own and is never read from the browser.

const depositReceivedSchema = z.object({
  method: z.enum(DEPOSIT_METHODS, {
    error: "Choose how the deposit was paid.",
  }),
  reference: z
    .string()
    .trim()
    .max(100, "Keep the reference to 100 characters or fewer."),
  // A datetime-local value on the business's clock, or empty for now.
  receivedAt: z.string(),
});

const DEPOSIT_RECEIVED_FAILURE: Record<string, StudioFailure> = {
  NO_BUSINESS_DEPOSIT: {
    kind: "conflict",
    message: "This booking has no deposit paid to the business.",
    nextStep: "Check the booking's price and deposit settings.",
  },
  BOOKING_NOT_OPEN: {
    kind: "conflict",
    message:
      "This booking is cancelled, declined or marked no-show, so its deposit cannot be marked received.",
    nextStep: "The page has refreshed; check the booking's status.",
  },
  DEPOSIT_ALREADY_RECEIVED: {
    kind: "conflict",
    message: "This deposit is already marked received.",
    nextStep: "The page has refreshed and shows when it arrived.",
  },
  DEPOSIT_NOT_RECEIVED: {
    kind: "conflict",
    message:
      "This deposit is not marked received, so there is nothing to undo.",
    nextStep: "The page has refreshed and shows the deposit as due.",
  },
  DEPOSIT_RECEIVED_IN_FUTURE: {
    kind: "invalid",
    message: "The time the deposit arrived cannot be in the future.",
    nextStep: "Choose an earlier time, or leave it empty to use now.",
  },
};

/** The API's stable `code` for a deposit refusal; anything else falls back to the shared wording. */
function depositReceivedFailure(error: unknown): StudioFailure | null {
  const code = ResponseError.is(error) ? codeOf(error.data) : undefined;
  return code ? (DEPOSIT_RECEIVED_FAILURE[code] ?? null) : null;
}

export async function markDepositReceivedAction(
  orgSlug: string,
  bookingId: string,
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const parsed = depositReceivedSchema.safeParse({
    method: text("method"),
    reference: text("reference"),
    receivedAt: text("receivedAt"),
  });
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Check the form.");
  }
  const { method, reference, receivedAt } = parsed.data;
  const when = receivedAt === "" ? null : parseLocalWhen(receivedAt);
  if (receivedAt !== "" && !when) {
    return invalid("Choose a valid time, or leave it empty to use now.");
  }
  return await run(
    orgSlug,
    bookingId,
    "Deposit received.",
    async (token, org, id) =>
      markDepositReceived(token, org, id, {
        method,
        ...(reference ? { reference } : {}),
        // The wall-clock time is read on the business's own clock.
        ...(when
          ? {
              receivedAt: zonedToUtcIso(
                when.day,
                when.time,
                await getBusinessTimezone(token, org)
              ),
            }
          : {}),
      }),
    { failure: depositReceivedFailure }
  );
}

export async function undoDepositReceivedAction(
  orgSlug: string,
  bookingId: string,
  _previous: ActionState
): Promise<ActionState> {
  return await run(
    orgSlug,
    bookingId,
    "Deposit receipt undone. The deposit is due again.",
    undoDepositReceived,
    { failure: depositReceivedFailure }
  );
}
