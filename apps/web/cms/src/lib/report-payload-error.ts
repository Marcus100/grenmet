import type { AfterErrorHook } from "payload";

function statusOf(error: Error): number {
  return "status" in error && typeof error.status === "number"
    ? error.status
    : 500;
}

/**
 * Payload turns handler failures into JSON responses, so they never reach
 * Next's `onRequestError`. Report server-side failures (5xx) to Sentry;
 * validation, auth and not-found responses are expected outcomes.
 *
 * Sentry is imported lazily so loading this config for migrations (outside
 * Next.js) never requires the Sentry SDK.
 */
export const reportPayloadError: AfterErrorHook = async ({ error }) => {
  if (statusOf(error) < 500) return;
  const { captureException } = await import("@sentry/nextjs");
  captureException(error, { tags: { area: "cms" } });
};
