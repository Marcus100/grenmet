import { createReportError } from "@barrelsgd/ui/lib/report-error";

/**
 * Report an error that was caught and turned into a fallback UI or response.
 * Errors that are rethrown reach Sentry through the error boundaries and
 * `onRequestError`, so only call this where the error is swallowed.
 *
 * Sentry is imported on demand so the SDK stays out of the first-load bundle
 * of every route that merely might report an error.
 */
export const reportError = createReportError((error, context) => {
  import("@sentry/nextjs")
    .then(({ captureException }) => captureException(error, context))
    .catch(() => {
      /* Reporting must never throw into the caller. */
    });
});
