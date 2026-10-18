import type { Instrumentation } from "next";

// Server-side only, and only when a DSN is configured. This app ships no
// client Sentry SDK on purpose: the public alert pages must stay light on 3G.
// Errors reach Sentry through `onRequestError` and `reportError`.
const SENTRY_ENABLED = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

export async function register() {
  if (!SENTRY_ENABLED) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  ...args
) => {
  if (!SENTRY_ENABLED) return;
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(...args);
};
