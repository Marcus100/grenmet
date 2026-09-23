import { scrubSentryEvent } from "@barrelsgd/ui/lib/sentry-privacy";
import { init } from "@sentry/nextjs";

init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
  debug: false,
});
