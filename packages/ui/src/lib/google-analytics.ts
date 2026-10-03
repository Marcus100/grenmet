import type { AnalyticsConfig } from "./analytics-policy";

const GA_ID = /^G-[A-Z0-9]+$/;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/** Google interprets Arguments commands; arrays are not the gtag protocol. */
export function googleTag(..._commands: unknown[]) {
  window.dataLayer ??= [];
  // biome-ignore lint/complexity/noArguments: Google's documented gtag command protocol requires Arguments objects.
  window.dataLayer.push(arguments);
}

export function startGoogleAnalytics(config: AnalyticsConfig): void {
  if (!(config.ga4 && GA_ID.test(config.ga4))) return;
  Object.assign(window, { [`ga-disable-${config.ga4}`]: false });
  googleTag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  googleTag("js", new Date());
  googleTag("config", config.ga4, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_domain: "none",
    cookie_expires: 183 * 86_400,
    page_location: config.origin,
    page_referrer: "",
    page_title: config.app,
  });
  if (!document.getElementById("optional-google-analytics")) {
    const script = document.createElement("script");
    script.id = "optional-google-analytics";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${config.ga4}`;
    document.head.append(script);
  }
}

export function captureGoogleEvent(
  config: AnalyticsConfig,
  event: string,
  properties: Record<string, string>
): void {
  if (!(config.ga4 && GA_ID.test(config.ga4))) return;
  googleTag("event", event === "page_viewed" ? "page_view" : event, {
    ...properties,
    send_to: config.ga4,
    app: config.app,
    environment: config.environment,
    release: config.release,
    schema_version: 1,
    page_location: `${config.origin}/${properties.section ?? ""}`,
    page_referrer: "",
    page_title: properties.section ?? config.app,
  });
}

export function stopGoogleAnalytics(id: string | null): void {
  if (id) Object.assign(window, { [`ga-disable-${id}`]: true });
  document.getElementById("optional-google-analytics")?.remove();
  // Preserve the queue patched by Google's loader across consent changes.
  if (window.dataLayer) window.dataLayer.length = 0;
}
