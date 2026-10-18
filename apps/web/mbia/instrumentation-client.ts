// Sentry's browser SDK is ~120 KB gzip. Loading it with a static import puts it
// in the first-load bundle of every page and delays hydration on slow mobile
// links, so it is fetched after the page is interactive instead. Errors thrown
// before it loads are not captured; that is the accepted trade-off.
type SentryModule = typeof import("@sentry/nextjs");

let sentry: SentryModule | undefined;

async function loadSentry() {
  const [privacy, loaded] = await Promise.all([
    import("@barrelsgd/ui/lib/sentry-privacy"),
    import("@sentry/nextjs"),
  ]);
  loaded.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
    release: process.env.NEXT_PUBLIC_RELEASE,
    tracesSampleRate: 0,
    dataCollection: privacy.sentryDataCollection,
    ignoreSpans: privacy.sentryIgnoredSpans,
    beforeSend: privacy.scrubSentryEvent,
    beforeSendTransaction: privacy.scrubSentryTransaction,
    debug: false,
    ignoreErrors: ["ResizeObserver loop limit exceeded"],
  });
  sentry = loaded;
}

function scheduleSentry() {
  const start = () => {
    loadSentry().catch(() => {
      /* Error reporting must never affect the page. */
    });
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(start, { timeout: 4000 });
  } else {
    setTimeout(start, 2000);
  }
}

if (document.readyState === "complete") {
  scheduleSentry();
} else {
  window.addEventListener("load", scheduleSentry, { once: true });
}

export function onRouterTransitionStart(
  ...args: Parameters<SentryModule["captureRouterTransitionStart"]>
) {
  sentry?.captureRouterTransitionStart(...args);
}
