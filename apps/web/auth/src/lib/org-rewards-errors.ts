/** Turns an API failure into something a rewards admin page can explain. */

export type FailureKind =
  | "unauthorised"
  | "not-entitled"
  | "forbidden"
  | "not-found"
  | "invalid"
  | "unavailable"
  | "unknown";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function errorStatus(error: unknown): number | undefined {
  if (isRecord(error) && typeof error.status === "number") return error.status;
}

const VALUE_ERROR_PREFIX = /^Value error, /;
const MAX_DETAIL = 300;

function clean(text: string): string {
  return text.replace(VALUE_ERROR_PREFIX, "").slice(0, MAX_DETAIL);
}

/** The API's own words for a 4xx: `detail`, else the validation messages. */
export function errorDetail(error: unknown): string | undefined {
  if (!(isRecord(error) && isRecord(error.data))) return;
  const { detail, errors } = error.data;
  if (typeof detail === "string" && detail.length > 0) return clean(detail);
  if (Array.isArray(errors)) {
    const messages = errors
      .map((item) => (isRecord(item) ? item.msg : undefined))
      .filter((msg): msg is string => typeof msg === "string");
    if (messages.length > 0) return clean(messages.map(clean).join(" "));
  }
}

export function classifyFailure(error: unknown): FailureKind {
  const status = errorStatus(error);
  if (status === 401) return "unauthorised";
  if (status === 403) {
    return errorDetail(error)?.toLowerCase().includes("entitled")
      ? "not-entitled"
      : "forbidden";
  }
  if (status === 404) return "not-found";
  if (status === 400 || status === 409 || status === 422) return "invalid";
  if (status === 503) return "unavailable";
  return "unknown";
}

export const FAILURE_TEXT: Record<FailureKind, string> = {
  forbidden:
    "Your role or this organisation's status doesn't allow that. Only owners and admins can change rewards.",
  "not-entitled":
    "Rewards isn't switched on for this organisation. Ask the Barrels team to enable it.",
  "not-found": "We couldn't find that. It may have been removed.",
  invalid: "That wasn't accepted. Check the details and try again.",
  unauthorised: "Your session has ended. Sign in again.",
  unavailable:
    "This isn't available right now. Please try again in a few minutes.",
  unknown:
    "That didn't work. Try again, or ask the team if it keeps happening.",
};
