import { createReportError } from "@barrelsgd/ui/lib/report-error";
import { captureException } from "@sentry/nextjs";

/**
 * Report an error that was caught and turned into a fallback UI or response.
 * Errors that are rethrown reach Sentry through the error boundaries, so only
 * call this where the error is swallowed.
 */
export const reportError = createReportError(captureException);
