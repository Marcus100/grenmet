// Maps booking API failures to customer wording. The host app turns its own
// transport errors into a status and detail (see failureFrom in the app), so
// this module stays free of the generated client at runtime.

export type FailureCode =
  | "slot_taken"
  | "cutoff"
  | "conflict"
  | "not_found"
  | "verification"
  | "rate_limited"
  | "invalid"
  | "unavailable"
  // The emailed-code step before a deposit booking (#471, #495).
  | "email_unverified"
  | "code_rejected"
  | "code_locked"
  | "code_limited"
  | "code_unavailable"
  | "code_send_failed";

export interface Failure {
  code: FailureCode;
  message: string;
  ok: false;
}

export interface Success<T> {
  data: T;
  ok: true;
}

export type Outcome<T> = Success<T> | Failure;

export type BookingAction =
  | "read"
  | "create"
  | "cancel"
  | "reschedule"
  | "email-code"
  | "email-confirm";

/** Text of the API's 409 for a slot another customer took (bookings/public.py). */
const SLOT_TAKEN_MARK = "no longer available";
/** Text of the API's 409 inside the cancellation cutoff. */
const CUTOFF_MARK = "hours before they start";
/** The stable code the API puts first in the 403 for a deposit with no proof. */
const EMAIL_UNVERIFIED_MARK = "email_verification_required";

function failure(code: FailureCode, message: string): Failure {
  return { ok: false, code, message };
}

/** The API's `{ "detail": "..." }` text, when it sent one. */
export function detailOf(data: unknown): string | undefined {
  if (typeof data === "object" && data !== null && "detail" in data) {
    const { detail } = data;
    return typeof detail === "string" ? detail : undefined;
  }
}

/**
 * The emailed-code calls. Wrong and expired codes share one answer (400) so
 * the wording covers both; 429 on confirm is the 15-minute lock, on request it
 * is the send limit. Nothing here blames the visitor for a mail fault.
 */
function classifyEmailCode(
  status: number,
  action: "email-code" | "email-confirm",
  contactLabel?: string
): Failure {
  if (status === 404) {
    return failure(
      "not_found",
      "Online booking is not available for this business right now."
    );
  }
  if (status === 422) {
    return failure(
      "invalid",
      "Please check the email address and the code, then try again."
    );
  }
  if (status === 503) {
    return failure(
      "code_unavailable",
      "Email verification is unavailable right now. Nothing has been booked or charged. Please try again in a minute."
    );
  }
  if (action === "email-confirm") {
    if (status === 400) {
      return failure(
        "code_rejected",
        "That code isn't right, or it has expired. Check the latest email we sent, or ask for a new code."
      );
    }
    if (status === 429) {
      return failure(
        "code_locked",
        "Too many wrong codes. For your security this email is locked for about 15 minutes. Please try again after that, or use a different email address."
      );
    }
    return failure(
      "code_unavailable",
      "We couldn't check that code just now. Please try again in a minute."
    );
  }
  if (status === 429) {
    return failure(
      "code_limited",
      "We can't send another code just yet. Please wait a few minutes (up to an hour if you've asked several times) and try again. A code we already sent may be in your spam folder."
    );
  }
  if (status === 400) {
    return failure(
      "verification",
      "We couldn't verify the request. Please try again."
    );
  }
  return failure(
    "code_send_failed",
    contactLabel
      ? `We couldn't send the email. This may be a problem on our side, not yours. Please try again shortly, or message us on ${contactLabel}.`
      : "We couldn't send the email. This may be a problem on our side, not yours. Please try again shortly."
  );
}

/** The 403 for a deposit booking sent without a valid emailed-code proof. */
function emailUnverified(
  status: number,
  detail: string | undefined,
  action: BookingAction
): Failure | null {
  if (
    status === 403 &&
    action === "create" &&
    detail?.includes(EMAIL_UNVERIFIED_MARK)
  ) {
    return failure(
      "email_unverified",
      "We need to confirm your email again before booking. Press the button below and we will email you a new code."
    );
  }
  return null;
}

/**
 * Maps an API status to a message a customer can act on. `contactLabel` names
 * the studio's manual channel (e.g. "Instagram") in the unavailable message.
 */
export function classifyFailure(
  status: number,
  detail: string | undefined,
  action: BookingAction,
  contactLabel?: string
): Failure {
  if (action === "email-code" || action === "email-confirm") {
    return classifyEmailCode(status, action, contactLabel);
  }
  const unverified = emailUnverified(status, detail, action);
  if (unverified) {
    return unverified;
  }
  if (status === 409) {
    if (detail?.includes(SLOT_TAKEN_MARK)) {
      return failure(
        "slot_taken",
        "That time has just been taken. Please choose another."
      );
    }
    if (detail?.includes(CUTOFF_MARK)) {
      return failure("cutoff", detail);
    }
    if (action === "create") {
      return failure(
        "conflict",
        "This request no longer matches your earlier attempt. Please reload the page and try again."
      );
    }
    return failure(
      "conflict",
      detail ?? "This booking can no longer be changed online."
    );
  }
  if (status === 404) {
    return failure(
      "not_found",
      action === "create" || action === "read"
        ? "We couldn't find that. The link may have expired, or online booking is not available right now."
        : "We couldn't find this booking. The link may have expired."
    );
  }
  if (status === 429) {
    return failure(
      "rate_limited",
      "Too many attempts. Please wait a minute and try again."
    );
  }
  if ((status === 400 || status === 403) && action === "create") {
    return failure(
      "verification",
      "We couldn't verify the request. Please try again."
    );
  }
  if (status === 422 || status === 400) {
    return failure(
      "invalid",
      "Some details were not accepted. Please check the form and try again."
    );
  }
  return failure(
    "unavailable",
    contactLabel
      ? `Booking is unavailable right now. Please try again shortly, or message us on ${contactLabel}.`
      : "Booking is unavailable right now. Please try again shortly."
  );
}
