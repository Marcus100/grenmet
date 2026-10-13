/**
 * Shared rule for which caught errors are worth reporting to Sentry.
 *
 * This module deliberately does not import Sentry: a workspace package would
 * resolve its own, never-initialised copy of the SDK. Each app passes its own
 * `captureException` to `createReportError` in `src/lib/report-error.ts`.
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

/** The slice of Sentry's `captureException` that `reportError` relies on. */
export type CaptureError = (
  error: unknown,
  context: { tags: { area: string } }
) => unknown;

/**
 * Build an app's `reportError` around its own Sentry `captureException`. The
 * `area` tag is the only context sent, so no user data can reach Sentry here.
 */
export function createReportError(capture: CaptureError) {
  return function reportError(error: unknown, area: string): void {
    if (shouldReportError(error)) {
      capture(error, { tags: { area } });
    }
  };
}
