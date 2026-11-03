import { onPublicEnv, readPublicEnv } from "@barrelsgd/ui/lib/public-env";
import {
  scrubSentryEvent,
  scrubSentryTransaction,
  sentryDataCollection,
  sentryIgnoredSpans,
} from "@barrelsgd/ui/lib/sentry-privacy";

// Sentry is only loaded when this environment has a DSN. The DSN comes from
// /runtime-env.js at run time (issue #1019), and this file runs before
// beforeInteractive scripts, so the check waits for it.
let sentryEnabled = false;

onPublicEnv(() => {
  sentryEnabled = Boolean(readPublicEnv("NEXT_PUBLIC_SENTRY_DSN"));
  if (!sentryEnabled) return;
  import("@sentry/nextjs").then(({ init }) => {
    init({
      dsn: readPublicEnv("NEXT_PUBLIC_SENTRY_DSN"),
      environment:
        readPublicEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT") ?? "development",
      release: readPublicEnv("NEXT_PUBLIC_RELEASE"),
      tracesSampleRate: 0,
      dataCollection: sentryDataCollection,
      ignoreSpans: sentryIgnoredSpans,
      beforeSend: scrubSentryEvent,
      beforeSendTransaction: scrubSentryTransaction,
      debug: false,
      ignoreErrors: ["ResizeObserver loop limit exceeded"],
    });
  });
});

export const onRouterTransitionStart = async (
  href: string,
  navigationType: string
): Promise<void> => {
  if (!sentryEnabled) return;
  const { captureRouterTransitionStart } = await import("@sentry/nextjs");
  captureRouterTransitionStart(href, navigationType);
};
