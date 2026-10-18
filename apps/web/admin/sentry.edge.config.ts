import {
  scrubSentryEvent,
  scrubSentryTransaction,
  sentryDataCollection,
  sentryIgnoredSpans,
} from "@barrelsgd/ui/lib/sentry-privacy";
import { init } from "@sentry/nextjs";

init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
  release: process.env.NEXT_PUBLIC_RELEASE,
  tracesSampleRate: 0,
  dataCollection: sentryDataCollection,
  ignoreSpans: sentryIgnoredSpans,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryTransaction,
  debug: false,
});
