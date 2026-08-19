// Sentry is only loaded when a DSN is configured — the client SDK stays out
// of the compile graph (and the browser bundle) when running without Sentry.
// NEXT_PUBLIC_ vars are inlined at build time, so the dynamic imports below
// are statically unreachable (and droppable) when the DSN is unset.
const SENTRY_ENABLED = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

if (SENTRY_ENABLED) {
  import("@sentry/nextjs").then(({ init }) => {
    init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
      tracesSampleRate: 0,
      debug: false,
      ignoreErrors: ["ResizeObserver loop limit exceeded"],
    });
  });
}

export const onRouterTransitionStart = async (
  href: string,
  navigationType: string
): Promise<void> => {
  if (!SENTRY_ENABLED) return;
  const { captureRouterTransitionStart } = await import("@sentry/nextjs");
  captureRouterTransitionStart(href, navigationType);
};
