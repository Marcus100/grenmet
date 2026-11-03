// The studio's side of API failures: turns the generated client's errors into
// a message a staff member can act on. Anything that is not an API response
// (a network fault, a bug) is rethrown so it reaches `error.tsx`.

import { ResponseError } from "@barrelsgd/api-client";

export type StudioFailureKind =
  | "signed_out"
  | "forbidden"
  | "not_found"
  | "invalid"
  | "conflict"
  | "unavailable";

export interface StudioFailure {
  kind: StudioFailureKind;
  message: string;
  /** What to do next, shown beside the message. */
  nextStep: string;
}

export function studioFailure(error: unknown): StudioFailure {
  if (!ResponseError.is(error)) {
    throw error;
  }
  switch (error.status) {
    case 401:
      return {
        kind: "signed_out",
        message: "Your session has ended.",
        nextStep: "Sign in again to continue.",
      };
    case 403:
      return {
        kind: "forbidden",
        message: "You are not a member of this business.",
        nextStep: "Ask the business owner to invite you, then try again.",
      };
    case 404:
      return {
        kind: "not_found",
        message: "We could not find that.",
        nextStep: "Go back to the agenda and choose again.",
      };
    case 400:
    case 422:
      return {
        kind: "invalid",
        message: "That date range or filter is not valid.",
        nextStep: "Choose another day, or clear the provider filter.",
      };
    default:
      return {
        kind: "unavailable",
        message: "The agenda is not available right now.",
        nextStep: "Try again in a moment.",
      };
  }
}

/** A member (not an admin) tried to change a booking. */
export const ADMIN_REQUIRED: StudioFailure = {
  kind: "forbidden",
  message: "You need admin access to change bookings.",
  nextStep: "Ask the business owner to make you an admin, then try again.",
};

/**
 * Failures of a booking action (confirm, decline, cancel, no-show, complete).
 * A 403 here means the person is a member but not an admin; a 409 means the
 * booking changed under them, so the page is refreshed and says so.
 */
export function actionFailure(error: unknown): StudioFailure {
  const unavailable: StudioFailure = {
    kind: "unavailable",
    message: "We could not save that change.",
    nextStep: "Try again in a moment.",
  };
  if (!ResponseError.is(error)) {
    return unavailable;
  }
  switch (error.status) {
    case 403:
      return ADMIN_REQUIRED;
    case 409:
      return {
        kind: "conflict",
        message:
          "This booking has already changed (it may already be cancelled or finished).",
        nextStep:
          "It was updated by someone else, or the time is no longer free. The page has refreshed; check its status and try again.",
      };
    case 400:
    case 422:
      return {
        kind: "invalid",
        message: "That change was not accepted.",
        nextStep: "Check the reason and try again.",
      };
    case 401:
    case 404:
      return studioFailure(error);
    default:
      return unavailable;
  }
}

/** A member (not an admin) tried to change the settings. */
export const SETTINGS_REFUSED: StudioFailure = {
  kind: "forbidden",
  message: "This business can't change booking settings right now.",
  nextStep:
    "Its bookings access may have changed. Reload, or ask a Barrels admin.",
};

export const SETTINGS_ADMIN_REQUIRED: StudioFailure = {
  kind: "forbidden",
  message: "You need admin access to change settings.",
  nextStep: "Ask the business owner to make you an admin, then try again.",
};

/**
 * The API's messages as text: `detail` as a string (AppException), or the
 * `msg` of each item in `detail[]` (FastAPI request validation) or `errors[]`
 * (the app's own validation handler). Nothing else is matched.
 */
export function detailText(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return "";
  }
  const { detail, errors } = data as { detail?: unknown; errors?: unknown };
  if (typeof detail === "string") {
    return detail;
  }
  const list = Array.isArray(detail) ? detail : errors;
  const items = Array.isArray(list) ? list : [];
  return items
    .map((item) =>
      typeof item === "object" && item !== null && "msg" in item
        ? String((item as { msg: unknown }).msg)
        : ""
    )
    .join("; ");
}

const RULES: ReadonlyArray<{ match: RegExp; failure: StudioFailure }> = [
  {
    match: /already in use/iu,
    failure: {
      kind: "conflict",
      message: "That booking address is already in use.",
      nextStep: "Choose another address and save again.",
    },
  },
  {
    match: /reserved/iu,
    failure: {
      kind: "invalid",
      message: "That booking address is reserved by the platform.",
      nextStep: "Choose another address and save again.",
    },
  },
  {
    match: /deposit cannot exceed/iu,
    failure: {
      kind: "invalid",
      message: "The deposit cannot exceed the price.",
      nextStep: "Lower the deposit or raise the price, then save again.",
    },
  },
  {
    match: /unknown iana timezone/iu,
    failure: {
      kind: "invalid",
      message: "That timezone is not recognised.",
      nextStep: "Use a name like America/Grenada.",
    },
  },
  {
    match: /overlap/iu,
    failure: {
      kind: "invalid",
      message: "Two working periods on the same day overlap.",
      nextStep: "Make each period start after the one before it ends.",
    },
  },
];

/**
 * Failures of a settings save, using the API's own error strings (reserved or
 * taken address, deposit above price, unknown timezone, overlapping hours).
 * Anything else that is not an API response is "unavailable".
 */
export function settingsFailure(error: unknown): StudioFailure {
  const unavailable: StudioFailure = {
    kind: "unavailable",
    message: "We could not save that change.",
    nextStep: "Try again in a moment.",
  };
  if (!ResponseError.is(error)) {
    return unavailable;
  }
  switch (error.status) {
    case 401:
      return studioFailure(error);
    case 403:
      // Our own role check ran first, so this is not about the person's role.
      return SETTINGS_REFUSED;
    case 404:
      return {
        kind: "not_found",
        message: "That item no longer exists.",
        nextStep: "Reload the settings and try again.",
      };
    case 409:
    case 400:
    case 422: {
      const text = detailText(error.data);
      const known = RULES.find((rule) => rule.match.test(text));
      if (known) {
        return known.failure;
      }
      return error.status === 409
        ? {
            kind: "conflict",
            message: "That change clashes with another one.",
            nextStep: "Reload the settings and try again.",
          }
        : {
            kind: "invalid",
            message: "The settings were not accepted.",
            nextStep: "Check each field and save again.",
          };
    }
    default:
      return unavailable;
  }
}
