import catalogue from "./service-catalogue.json";

export type PublicApp =
  | "barrels"
  | "elections"
  | "gms"
  | "docs"
  | "signal"
  | "events"
  | "mbia";
export type Environment = "development" | "staging" | "production";
export interface AnalyticsConfig {
  app: PublicApp;
  environment: Environment;
  ga4: string | null;
  origin: string;
  posthog: { key: string; host: string } | null;
  release: string;
}
export const SCHEMA_VERSION = 1;
export const CONSENT_KEY = "barrels-analytics-consent-v1";
export const CONSENT_MS = 183 * 24 * 60 * 60 * 1000;
const PUBLIC_APPS = new Set([
  "barrels",
  "elections",
  "gms",
  "docs",
  "signal",
  "events",
  "mbia",
]);
export function configForOrigin(
  app: string,
  origin: string
): AnalyticsConfig | null {
  const service = catalogue.services.find((entry) => entry.id === app);
  if (!(service?.publicAnalytics && PUBLIC_APPS.has(app))) return null;
  for (const [environment, entry] of Object.entries(service.environments)) {
    if (environment !== "production" || entry.origin !== origin) continue;
    const hostname = new URL(origin).hostname;
    if (
      !(hostname === "barrels.gd" || hostname.endsWith(".barrels.gd")) ||
      hostname.split(".").includes("staging")
    )
      continue;
    const mapping = entry.analytics;
    const approved =
      mapping.retentionVerified &&
      mapping.accessVerified &&
      ["configured", "delivery-verified"].includes(mapping.status);
    if (entry.origin !== origin || !approved) continue;
    return {
      app: app as PublicApp,
      environment: environment as Environment,
      origin,
      release: entry.release ?? "unknown",
      ga4: mapping.ga4,
      posthog: mapping.posthog,
    };
  }
  return null;
}
export function browserOptOut(): boolean {
  return (
    navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true
  );
}
export function readConsent(now = Date.now()): "accepted" | "declined" | null {
  if (browserOptOut()) return "declined";
  try {
    const stored = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "null");
    if (
      stored &&
      typeof stored === "object" &&
      "expires" in stored &&
      typeof stored.expires === "number" &&
      "value" in stored &&
      (stored.value === "accepted" || stored.value === "declined") &&
      stored.expires > now &&
      stored.expires <= now + CONSENT_MS
    )
      return stored.value;
  } catch {
    /* Storage unavailable: optional collection stays off. */
  }
  return null;
}
const SECTIONS = [
  "home",
  "events",
  "groups",
  "results",
  "2026",
  "constituencies",
  "forecast",
  "make-your-map",
  "sources",
  "history",
  "weather",
  "alerts",
  "marine",
  "climate",
  "services",
  "explore",
  "about",
  "weather-ready",
  "check-d-ting",
  "opportunity",
  "travel",
  "at-the-airport",
  "business",
  "corporate",
  "development",
  "news",
  "flights",
  "airports",
  "contact",
  "other",
] as const;
const URL_SUFFIX = /[?#]/;
export function pageSection(path: string): (typeof SECTIONS)[number] {
  const section = path.split(URL_SUFFIX)[0].split("/")[1] || "home";
  return (SECTIONS as readonly string[]).includes(section)
    ? (section as (typeof SECTIONS)[number])
    : "other";
}
const EVENTS = {
  page_viewed: { section: SECTIONS },
  personal_site_clicked: {},
  year_selected: {
    year: [
      "1951",
      "1954",
      "1957",
      "1961",
      "1962",
      "1967",
      "1972",
      "1976",
      "1984",
      "1990",
      "1995",
      "1999",
      "2003",
      "2008",
      "2013",
      "2016",
      "2018",
      "2022",
      "2026",
    ],
  },
  map_mode_changed: {
    mode: ["winner", "margin", "turnout", "share", "swing", "map", "seats"],
  },
  constituency_opened: {},
  forecast_viewed: {},
  csv_download_clicked: {},
  prediction_share_completed: { method: ["clipboard", "native"] },
  weather_section_opened: {
    section: [
      "weather",
      "alerts",
      "marine",
      "climate",
      "services",
      "explore",
      "about",
    ],
  },
  forecast_tab_selected: { day: ["now", "today", "next"] },
  public_warning_opened: {},
  published_download_clicked: {},
  content_opened: { section: SECTIONS },
  navigation_category_selected: { section: SECTIONS },
  external_destination_clicked: {
    destination: ["personal", "official", "other"],
  },
} as const;
export type AnalyticsEvent = keyof typeof EVENTS;
export type EventProperties<E extends AnalyticsEvent> = {
  [K in keyof (typeof EVENTS)[E]]: (typeof EVENTS)[E][K] extends readonly (infer V)[]
    ? V
    : never;
};
const APP_EVENTS: Record<PublicApp, readonly AnalyticsEvent[]> = {
  events: ["page_viewed"],
  barrels: ["page_viewed", "personal_site_clicked"],
  elections: [
    "page_viewed",
    "year_selected",
    "map_mode_changed",
    "constituency_opened",
    "forecast_viewed",
    "csv_download_clicked",
    "prediction_share_completed",
  ],
  gms: [
    "page_viewed",
    "weather_section_opened",
    "forecast_tab_selected",
    "public_warning_opened",
    "published_download_clicked",
  ],
  docs: [
    "page_viewed",
    "content_opened",
    "navigation_category_selected",
    "published_download_clicked",
  ],
  signal: [
    "page_viewed",
    "content_opened",
    "navigation_category_selected",
    "published_download_clicked",
  ],
  mbia: [
    "page_viewed",
    "navigation_category_selected",
    "external_destination_clicked",
  ],
};

/** Events also hosts private member and organiser pages on the same origin. */
export function analyticsAllowedOnPath(app: PublicApp, path: string): boolean {
  if (app !== "events") return true;
  const pathname = path.split(URL_SUFFIX)[0];
  return (
    pathname === "/" ||
    pathname === "/events" ||
    pathname.startsWith("/events/") ||
    pathname === "/groups" ||
    pathname.startsWith("/groups/")
  );
}
/** Reject unknown properties, not merely suspicious-looking values. */
export function sanitizeEvent(
  app: PublicApp,
  event: string,
  properties: Record<string, unknown>
): Record<string, string> | null {
  if (!APP_EVENTS[app]?.includes(event as AnalyticsEvent)) return null;
  const rules = EVENTS[event as AnalyticsEvent] as Record<
    string,
    readonly string[]
  >;
  if (Object.keys(properties).length !== Object.keys(rules).length) return null;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (
      typeof value !== "string" ||
      !(Object.hasOwn(rules, key) && rules[key].includes(value))
    )
      return null;
    result[key] = value;
  }
  return result;
}
