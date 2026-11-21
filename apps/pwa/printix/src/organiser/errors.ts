import { reportError } from "@/lib/report-error";

// What a failed organiser call means, in plain words. Pure, so every mapping is
// covered by a test. Errors are recognised by name, as src/lib/scan-api.ts does:
// the API client exports ResponseError twice and the bundler drops that export,
// so `instanceof` is not used here either.

/** The authenticator check that every organiser route makes (privileged_mfa.py). */
export const ENROLMENT_REQUIRED_CODE = "mfa_enrolment_required";

/**
 * The structured code the sign-in refuses a person without an authenticator
 * with (companion API change). Preferred over text when the body has a `code`.
 */
export const AUTHENTICATOR_REQUIRED_CODE = "authenticator_required";

const NO_AUTHENTICATOR_CODES: readonly string[] = [
  AUTHENTICATOR_REQUIRED_CODE,
  ENROLMENT_REQUIRED_CODE,
];

/** Used when the server gives no usable Retry-After. */
const DEFAULT_RETRY_SECONDS = 60;
const MAX_RETRY_SECONDS = 3600;

/**
 * Every way an organiser call can fail, as the screens need to tell them apart.
 * `failed` is the only kind that is reported as an unexpected error.
 */
export type Problem =
  | { readonly kind: "rate-limited"; readonly retryAfterSeconds: number }
  | { readonly kind: "rejected" }
  | { readonly kind: "invalid"; readonly messages: readonly string[] }
  | { readonly kind: "event-closed" }
  | { readonly kind: "gate-codes-full" }
  | { readonly kind: "already-admitted" }
  | { readonly kind: "conflict" }
  | { readonly kind: "too-large" }
  | { readonly kind: "download-stopped" }
  | { readonly kind: "export-too-large" }
  | { readonly kind: "typed-numbers-refused" }
  | { readonly kind: "email-code-wrong" }
  | { readonly kind: "authenticator-wrong" }
  | { readonly kind: "not-set-up" }
  | { readonly kind: "no-authenticator" }
  | { readonly kind: "authenticator-session" }
  | { readonly kind: "forbidden" }
  | { readonly kind: "not-found" }
  | { readonly kind: "session-ended" }
  | { readonly kind: "no-signal" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "failed" };

/** The parts of the API client's ResponseError the organiser reads. */
interface HttpError extends Error {
  readonly data?: unknown;
  readonly response: Response;
  readonly status: number;
}

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/** A response that did not match the generated schema: never shown as data. */
export function invalidResponse(): Error {
  return namedError(
    "InvalidResponseError",
    "The server answered with an unexpected shape."
  );
}

/** The organiser session ended (the refresh was refused). Screens return to sign-in. */
export function sessionEnded(): Error {
  return namedError("SessionEndedError", "The organiser session has ended.");
}

export function isHttpError(error: unknown): error is HttpError {
  return (
    error instanceof Error &&
    error.name === "ResponseError" &&
    "status" in error &&
    typeof error.status === "number" &&
    "response" in error &&
    error.response instanceof Response
  );
}

function hasName(error: unknown, names: readonly string[]): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string" &&
    names.includes(error.name)
  );
}

const VALUE_ERROR_PREFIX = /^Value error, /u;

/**
 * The plain sentences of a validation answer (422). Pydantic prefixes its
 * messages with "Value error, "; that prefix is not for people.
 */
function validationMessages(data: unknown): string[] {
  if (typeof data !== "object" || data === null) {
    return [];
  }
  const messages: string[] = [];
  if ("detail" in data && typeof data.detail === "string") {
    messages.push(data.detail);
  }
  if ("errors" in data && Array.isArray(data.errors)) {
    for (const item of data.errors) {
      if (
        typeof item === "object" &&
        item !== null &&
        "msg" in item &&
        typeof item.msg === "string"
      ) {
        messages.push(item.msg.replace(VALUE_ERROR_PREFIX, ""));
      }
    }
  }
  return messages;
}

/** The body's structured `code`, when it has one. */
function structuredCode(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("code" in data)) {
    return null;
  }
  return typeof data.code === "string" ? data.code : null;
}

/** Every string the error body could say why, joined for matching. */
function bodyText(data: unknown): string {
  if (typeof data !== "object" || data === null) {
    return "";
  }
  return ["detail", "error", "code"]
    .map((key) => (key in data ? (data as Record<string, unknown>)[key] : ""))
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function retryAfterSeconds(error: HttpError): number {
  const seconds = Number(error.response.headers.get("Retry-After"));
  return Number.isInteger(seconds) && seconds > 0
    ? Math.min(seconds, MAX_RETRY_SECONDS)
    : DEFAULT_RETRY_SECONDS;
}

/** A 409 says which change was refused; each gets its own sentence. */
function conflictProblem(text: string): Problem {
  if (text.includes("active gate codes")) {
    return { kind: "gate-codes-full" };
  }
  if (text.includes("is closed")) {
    return { kind: "event-closed" };
  }
  if (text.includes("already admitted")) {
    return { kind: "already-admitted" };
  }
  return { kind: "conflict" };
}

function httpProblem(error: HttpError): Problem {
  const text = bodyText(error.data);
  const code = structuredCode(error.data);
  // A structured code wins over any wording in the text.
  if (
    error.status === 403 &&
    code !== null &&
    NO_AUTHENTICATOR_CODES.includes(code)
  ) {
    return { kind: "no-authenticator" };
  }
  switch (error.status) {
    case 400:
      if (text.includes("Two-factor")) {
        return { kind: "authenticator-wrong" };
      }
      if (text.includes("That code is wrong or has expired")) {
        return { kind: "email-code-wrong" };
      }
      return { kind: "failed" };
    case 401:
      return { kind: "session-ended" };
    case 403:
      if (text.includes("typed printed numbers")) {
        return { kind: "typed-numbers-refused" };
      }
      // Text fallback for a body with no structured code: the detail ends with the code.
      if (NO_AUTHENTICATOR_CODES.some((known) => text.includes(known))) {
        return { kind: "no-authenticator" };
      }
      if (text.includes("Sign in again with your authenticator")) {
        return { kind: "authenticator-session" };
      }
      if (
        text.includes("Ask the team to give you access") ||
        text.includes("can't sign in to this app")
      ) {
        return { kind: "not-set-up" };
      }
      return { kind: "forbidden" };
    case 404:
      return { kind: "not-found" };
    case 409:
      return conflictProblem(text);
    case 413:
      return { kind: "too-large" };
    case 422: {
      const messages = validationMessages(error.data);
      return messages.length > 0
        ? { kind: "invalid", messages }
        : { kind: "rejected" };
    }
    case 429:
      return {
        kind: "rate-limited",
        retryAfterSeconds: retryAfterSeconds(error),
      };
    case 503:
      return { kind: "unavailable" };
    default:
      return { kind: "failed" };
  }
}

/**
 * Maps any error from an organiser call to one problem. A request the phone
 * gave up on, or a network failure (fetch rejects with a TypeError), is no
 * signal.
 */
export function problemOf(error: unknown): Problem {
  if (hasName(error, ["SessionEndedError"])) {
    return { kind: "session-ended" };
  }
  if (hasName(error, ["TimeoutError", "AbortError"])) {
    return { kind: "no-signal" };
  }
  if (isHttpError(error)) {
    return httpProblem(error);
  }
  if (error instanceof TypeError) {
    return { kind: "no-signal" };
  }
  return { kind: "failed" };
}

/** The words a person reads. Plain, with no codes and no abbreviations. */
export function problemMessage(problem: Problem): string {
  switch (problem.kind) {
    case "rate-limited":
      return `Too many attempts. Try again in ${problem.retryAfterSeconds} ${
        problem.retryAfterSeconds === 1 ? "second" : "seconds"
      }.`;
    case "invalid":
      return problem.messages.join(" ");
    case "event-closed":
      return "This event is closed, so nothing here can change.";
    case "gate-codes-full":
      return "This event already has 20 active gate codes. Cancel one before making another.";
    case "already-admitted":
      return "This ticket was already admitted at the gate, so it cannot be voided.";
    case "conflict":
      return "That change could not be made. Refresh the page and try again.";
    case "too-large":
      return "That file is larger than 2 MB. Remove rows that are not needed and try again.";
    case "download-stopped":
      return "The download stopped early, so the file is not complete and was not saved. Try again.";
    case "export-too-large":
      return "This event has more scans than one download can hold. Ask Barrels for a full export.";
    case "typed-numbers-refused":
      return "Only an organiser can allow typed numbers on a gate code. Turn that off and try again.";
    case "rejected":
      return "Check what you typed, then try again.";
    case "email-code-wrong":
      return "That email code is wrong or has expired. Send a new code and try again.";
    case "authenticator-wrong":
      return "That authenticator code is wrong. Check the 6-digit code in your authenticator app and try again. Codes change every 30 seconds.";
    case "not-set-up":
      return "This account is not set up for Printix yet. Ask Barrels to give you access.";
    case "no-authenticator":
      return "Add an authenticator at auth.barrels.gd/security first, then sign in here again.";
    case "authenticator-session":
      return "This sign-in did not pass the authenticator check. Sign out, then sign in again with your authenticator code.";
    case "forbidden":
      return "You do not have access to this organisation's Printix events.";
    case "not-found":
      return "That event is not in this organisation.";
    case "session-ended":
      return "Your session has ended. Sign in again.";
    case "no-signal":
      return "No signal. Organiser screens need a connection, so nothing new can be shown.";
    case "unavailable":
      return "The Printix service is not available right now. Try again in a few minutes.";
    case "failed":
      return "Something went wrong. Try again.";
    default:
      return assertNever(problem);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled problem: ${JSON.stringify(value)}`);
}

/** The answer of one organiser call: the value, or the one problem to show. */
export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: Problem };

/**
 * Turns a thrown error into a failed outcome. An error nobody expected is also
 * reported (the root rule: catch, show a fallback, call reportError).
 */
export function failed<T>(error: unknown, area: string): Outcome<T> {
  const problem = problemOf(error);
  if (problem.kind === "failed") {
    reportError(error, area);
  }
  return { ok: false, problem };
}
