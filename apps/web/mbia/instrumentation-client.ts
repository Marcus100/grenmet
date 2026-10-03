import {
  scrubSentryEvent,
  scrubSentryTransaction,
} from "@barrelsgd/ui/lib/sentry-privacy";
import { init } from "@sentry/nextjs";

init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
  release: process.env.NEXT_PUBLIC_RELEASE,
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryTransaction,
  debug: false,
  ignoreErrors: ["ResizeObserver loop limit exceeded"],
});

export { captureRouterTransitionStart as onRouterTransitionStart } from "@sentry/nextjs";
