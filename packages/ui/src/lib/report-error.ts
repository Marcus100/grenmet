/**
 * Shared rule for which caught errors are worth reporting to Sentry.
 *
 * This module deliberately does not import Sentry: a workspace package would
 * resolve its own, never-initialised copy of the SDK. Each app wraps this rule
 * in `src/lib/report-error.ts` using its own `@sentry/nextjs`.
 *
 * An HTTP 4xx (validation, conflict, signed out, forbidden, not found) is an
 * expected outcome the UI already explains. 5xx responses, network errors and
 * bugs are reported.
 */
export function shouldReportError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return true;
  }
  const { status } = error;
  return !(typeof status === "number" && status >= 400 && status < 500);
}
