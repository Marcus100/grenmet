import { init } from "@sentry/nextjs";

init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
  tracesSampleRate: 0,
  debug: false,
  ignoreErrors: ["ResizeObserver loop limit exceeded"],
});

export { captureRouterTransitionStart as onRouterTransitionStart } from "@sentry/nextjs";
