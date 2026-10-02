import { shouldReportError } from "@barrelsgd/ui/lib/report-error";
import { captureException } from "@sentry/nextjs";

/**
 * Report an error that was caught and turned into a fallback UI or response.
 * Errors that are rethrown reach Sentry through the error boundaries and
 * `onRequestError`, so only call this where the error is swallowed.
 */
export function reportError(error: unknown, area: string): void {
  if (shouldReportError(error)) {
    captureException(error, { tags: { area } });
  }
}
