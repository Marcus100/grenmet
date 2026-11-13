import { onPublicEnv, readPublicEnv } from "@barrelsgd/ui/lib/public-env";
import {
  scrubSentryEvent,
  scrubSentryTransaction,
  sentryDataCollection,
  sentryIgnoredSpans,
} from "@barrelsgd/ui/lib/sentry-privacy";
import { init } from "@sentry/nextjs";

// Waits for /runtime-env.js: this file runs before beforeInteractive scripts.
onPublicEnv(() =>
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
  })
);

export { captureRouterTransitionStart as onRouterTransitionStart } from "@sentry/nextjs";
