/**
 * Cookieless product analytics for the signed-in funnels: bookings, events and
 * account. PostHog's capture endpoint is called with `fetch`; this module sets
 * no cookie, writes no storage and loads no SDK.
 *
 * Privacy (ADR-0037): an event carries only the allow-listed ids and enums
 * below. Names, emails, phone numbers and free text cannot reach the payload
 * because `sanitizeFunnelProperties` reads only known keys and only values that
 * match their pattern. The distinct id is random and lives in memory for one
 * page load. Do Not Track and Global Privacy Control switch collection off.
 * The env kill switch is `NEXT_PUBLIC_FUNNEL_ANALYTICS_ENABLED=false`.
 *
 * Public sites keep their consent-gated GA4 and PostHog provider
 * (`posthog-provider.tsx`). This module is separate and does not run there.
 */
import { POSTHOG_INGEST_HOSTS } from "./content-security-policy";
import { type PublicEnvKey, readPublicEnv } from "./public-env";

export const FUNNEL_APPS = ["bookings", "events", "account"] as const;
export type FunnelApp = (typeof FUNNEL_APPS)[number];

/** Each event name lists the apps allowed to send it. */
const EVENT_APPS = {
  page_view: ["bookings", "events"],
  service_selected: ["bookings"],
  slot_selected: ["bookings"],
  booking_submitted: ["bookings"],
  booking_confirmed: ["bookings"],
  event_viewed: ["events"],
  checkout_started: ["events"],
  order_completed: ["events"],
  sign_in_started: ["account"],
  sign_in_completed: ["account"],
} as const satisfies Record<string, readonly FunnelApp[]>;

export type FunnelEventName = keyof typeof EVENT_APPS;

/** Ids and enums only. Organisation is the public business or organiser slug. */
export interface FunnelProperties {
  listing_id?: string;
  organisation?: string;
  page?: "business" | "event";
  service_id?: string;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/u;
// UUIDs and short internal ids. No spaces, dots or "@", so no names or emails.
const ID = /^[A-Za-z0-9_-]{1,64}$/u;
const PAGES = ["business", "event"] as const;

const PROPERTY_RULES: Record<
  keyof FunnelProperties,
  (value: string) => boolean
> = {
  organisation: (value) => SLUG.test(value),
  service_id: (value) => ID.test(value),
  listing_id: (value) => ID.test(value),
  page: (value) => (PAGES as readonly string[]).includes(value),
};

const PROPERTY_KEYS = Object.keys(PROPERTY_RULES) as (keyof FunnelProperties)[];

/** Keeps only the known keys whose values pass their pattern. Everything else is dropped. */
export function sanitizeFunnelProperties(
  input: Partial<Record<keyof FunnelProperties, unknown>>
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const key of PROPERTY_KEYS) {
    const value = input[key];
    if (typeof value === "string" && PROPERTY_RULES[key](value)) {
      safe[key] = value;
    }
  }
  return safe;
}

const KEY_PATTERN = /^[A-Za-z0-9_]{8,128}$/u;
/** Values that switch collection off (case-insensitive). Anything else leaves it on. */
const KILL_SWITCH_OFF: ReadonlySet<string> = new Set([
  "false",
  "0",
  "off",
  "no",
]);
/** Do Not Track values that mean "do not track" (`1` or `yes`). */
const DNT_ON: ReadonlySet<string | null | undefined> = new Set(["1", "yes"]);

function browserHostname(): string {
  return typeof window === "undefined" ? "" : window.location.hostname;
}

/**
 * `barrels.gd` and its subdomains, without a `staging` label. Local hosts and
 * preview hosts (for example `*.pages.dev`, `*.vercel.app`) are not matched.
 */
export function isProductionHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    (host === "barrels.gd" || host.endsWith(".barrels.gd")) &&
    !host.split(".").includes("staging")
  );
}
const TRAILING_SLASHES = /\/+$/u;

export interface FunnelSettings {
  readonly host: string;
  readonly key: string;
}

type PublicEnvReader = (key: PublicEnvKey) => string | undefined;

/**
 * Null (off) unless a project key is set and the kill switch is not `false`.
 * A host outside the allow-list also switches off, never falls back.
 */
export function funnelSettings(
  read: PublicEnvReader = readPublicEnv,
  hostname: string = browserHostname()
): FunnelSettings | null {
  // Production only: a production build on a production host, never a staging
  // host, localhost or a preview host (docs/operations/analytics-monitoring.md).
  if (
    read("NEXT_PUBLIC_ENVIRONMENT")?.trim() !== "production" ||
    !isProductionHostname(hostname)
  ) {
    return null;
  }
  const key = read("NEXT_PUBLIC_FUNNEL_ANALYTICS_KEY")?.trim() ?? "";
  if (!KEY_PATTERN.test(key)) {
    return null;
  }
  const killed = KILL_SWITCH_OFF.has(
    (read("NEXT_PUBLIC_FUNNEL_ANALYTICS_ENABLED") ?? "").trim().toLowerCase()
  );
  if (killed) {
    return null;
  }
  const host = (
    read("NEXT_PUBLIC_FUNNEL_ANALYTICS_HOST")?.trim() || POSTHOG_INGEST_HOSTS[0]
  ).replace(TRAILING_SLASHES, "");
  if (!(POSTHOG_INGEST_HOSTS as readonly string[]).includes(host)) {
    return null;
  }
  return { key, host };
}

export interface PrivacySignals {
  /** Do Not Track (`navigator.doNotTrack`, the legacy MS and window forms). */
  dnt: boolean;
  /** Global Privacy Control (`navigator.globalPrivacyControl`). */
  gpc: boolean;
}

export function refusesTracking(signals: PrivacySignals): boolean {
  return signals.dnt || signals.gpc;
}

export function browserPrivacySignals(): PrivacySignals {
  const nav = navigator as Navigator & {
    globalPrivacyControl?: boolean;
    msDoNotTrack?: string;
  };
  const win = window as Window & { doNotTrack?: string };
  return {
    dnt:
      DNT_ON.has(nav.doNotTrack) ||
      DNT_ON.has(nav.msDoNotTrack) ||
      DNT_ON.has(win.doNotTrack),
    gpc: nav.globalPrivacyControl === true,
  };
}

let anonymousId: string | undefined;

function randomId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

/** Random, in memory, new on every page load. Never written to storage. */
export function distinctIdForPageLoad(): string {
  anonymousId ??= randomId();
  return anonymousId;
}

export interface FunnelPayload {
  api_key: string;
  distinct_id: string;
  event: FunnelEventName;
  properties: Record<string, string | number | boolean>;
  timestamp: string;
}

export function buildFunnelPayload(input: {
  apiKey: string;
  app: FunnelApp;
  distinctId: string;
  event: FunnelEventName;
  properties: FunnelProperties;
  timestamp: string;
}): FunnelPayload {
  return {
    api_key: input.apiKey,
    distinct_id: input.distinctId,
    event: input.event,
    properties: {
      ...sanitizeFunnelProperties(input.properties),
      app: input.app,
      schema_version: 1,
      // PostHog: no person profile and no GeoIP lookup for these events.
      $process_person_profile: false,
      $geoip_disable: true,
    },
    timestamp: input.timestamp,
  };
}

export interface FunnelDeps {
  distinctId: () => string;
  now: () => Date;
  privacy: () => PrivacySignals;
  send: (url: string, body: string) => void;
  settings: () => FunnelSettings | null;
}

/** Plain-text body: a CORS "simple" request, so no preflight and no cookies. */
export function sendWithFetch(url: string, body: string): void {
  void fetch(url, {
    body,
    cache: "no-store",
    credentials: "omit",
    headers: { "Content-Type": "text/plain" },
    keepalive: true,
    method: "POST",
    mode: "cors",
    referrerPolicy: "no-referrer",
  }).catch(() => undefined);
}

export const browserFunnelDeps: FunnelDeps = {
  distinctId: distinctIdForPageLoad,
  now: () => new Date(),
  privacy: browserPrivacySignals,
  send: sendWithFetch,
  settings: () => funnelSettings(),
};

/** Sends one event if it is allowed for this app and collection is on. Never throws. */
export function captureFunnelEvent(
  app: FunnelApp,
  event: FunnelEventName,
  properties: FunnelProperties = {},
  deps: FunnelDeps = browserFunnelDeps
): boolean {
  try {
    if (!(EVENT_APPS[event] as readonly FunnelApp[]).includes(app)) {
      return false;
    }
    const settings = deps.settings();
    if (!settings || refusesTracking(deps.privacy())) {
      return false;
    }
    const payload = buildFunnelPayload({
      apiKey: settings.key,
      app,
      distinctId: deps.distinctId(),
      event,
      properties,
      timestamp: deps.now().toISOString(),
    });
    deps.send(`${settings.host}/capture/`, JSON.stringify(payload));
    return true;
  } catch {
    // Analytics cannot affect navigation or a booking.
    return false;
  }
}

/** A capture function bound to one app. */
export function createFunnel(
  app: FunnelApp,
  deps: FunnelDeps = browserFunnelDeps
) {
  return {
    capture: (event: FunnelEventName, properties?: FunnelProperties) =>
      captureFunnelEvent(app, event, properties, deps),
  };
}
