import type { Instrumentation } from "next";

// Sentry is only loaded when a DSN is configured — keeps the SDK out of the
// dev compile graph entirely when running locally without Sentry.
const SENTRY_ENABLED = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

export async function register() {
  if (!SENTRY_ENABLED) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  ...args
) => {
  if (!SENTRY_ENABLED) return;
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(...args);
};
