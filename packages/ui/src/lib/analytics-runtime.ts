import type { CaptureResult, PostHog } from "posthog-js";
import {
  type AnalyticsConfig,
  type AnalyticsEvent,
  type EventProperties,
  pageSection,
  readConsent,
  SCHEMA_VERSION,
  sanitizeEvent,
} from "./analytics-policy";

import {
  captureGoogleEvent,
  startGoogleAnalytics,
  stopGoogleAnalytics,
} from "./google-analytics";

let config: AnalyticsConfig | null = null;
let client: PostHog | null = null;
let initializing: Promise<void> | null = null;
let generation = 0;
let lastPage: string | null = null;

function enabled() {
  return config !== null && readConsent() === "accepted";
}

/** The provider adds many automatic fields. Rebuild the payload from reviewed fields. */
export function filterAnalyticsEvent(
  event: CaptureResult | null
): CaptureResult | null {
  if (!(event && enabled() && config)) return null;
  const properties = event.properties;
  const safe = sanitizeEvent(
    config.app,
    event.event,
    properties.reviewed ?? {}
  );
  if (!safe) return null;
  return {
    uuid: event.uuid,
    event: event.event,
    timestamp: event.timestamp,
    properties: {
      ...safe,
      app: config.app,
      environment: config.environment,
      release: config.release,
      schema_version: SCHEMA_VERSION,
      token: properties.token,
      distinct_id: properties.distinct_id,
      $process_person_profile: false,
      $geoip_disable: true,
    },
  };
}
export function captureEvent<E extends AnalyticsEvent>(
  event: E,
  properties: EventProperties<E>
): void {
  if (!(enabled() && config)) return;
  const safe = sanitizeEvent(config.app, event, properties);
  if (!safe) return;
  try {
    captureGoogleEvent(config, event, safe);
    client?.capture(event, { reviewed: safe });
  } catch {
    /* Analytics cannot affect navigation or business operations. */
  }
}
/** Reads only explicit, reviewed instrumentation attributes, never DOM text or form values. */
export function captureMarkedLink(link: HTMLAnchorElement): void {
  const event = link.dataset.analyticsEvent;
  if (!event) return;
  const properties: Record<string, string> = {};
  if (event === "forecast_tab_selected")
    properties.day = link.dataset.analyticsDay ?? "next";
  if (event === "navigation_category_selected")
    properties.section = pageSection(link.pathname);
  if (event === "external_destination_clicked")
    properties.destination = "other";
  captureEvent(event as AnalyticsEvent, properties);
}

export function capturePage(pathname: string, section: string) {
  if (!enabled() || lastPage === pathname) return;
  lastPage = pathname;
  if (config?.app === "docs" || config?.app === "signal")
    captureEvent("content_opened", { section: pageSection(pathname) });
  if (config?.app === "gms")
    captureEvent("weather_section_opened", {
      section: pageSection(
        pathname
      ) as EventProperties<"weather_section_opened">["section"],
    });
  if (config?.app === "elections" && pathname === "/forecast")
    captureEvent("forecast_viewed", {});
  captureEvent("page_viewed", {
    section: section as EventProperties<"page_viewed">["section"],
  });
}
export async function startAnalytics(next: AnalyticsConfig): Promise<void> {
  if (readConsent() !== "accepted") return;
  if (config && JSON.stringify(config) !== JSON.stringify(next)) return;
  if (initializing) return await initializing;
  config = next;
  const current = generation;
  initializing = (async () => {
    startGoogleAnalytics(next);
    if (
      next.posthog &&
      ["https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(
        next.posthog.host
      )
    ) {
      const { default: posthog } = await import("posthog-js");
      if (current !== generation || !enabled()) return;
      client = posthog;
      if (!posthog.__loaded)
        posthog.init(next.posthog.key, {
          api_host: next.posthog.host,
          defaults: "2026-01-30",
          person_profiles: "never",
          capture_pageview: false,
          capture_pageleave: false,
          autocapture: false,
          capture_exceptions: false,
          disable_session_recording: true,
          disable_surveys: true,
          advanced_disable_feature_flags: true,
          advanced_disable_flags: true,
          disable_external_dependency_loading: true,
          persistence: "localStorage",
          cross_subdomain_cookie: false,
          before_send: filterAnalyticsEvent,
        });
      posthog.opt_in_capturing({ captureEventName: false });
    }
  })().catch(() => {
    /* Network/provider failure leaves the site usable. */
  });
  return await initializing;
}
export function stopAnalytics(): void {
  generation += 1;
  stopGoogleAnalytics(config?.ga4 ?? null);
  config = null;
  initializing = null;
  lastPage = null;
  try {
    client?.opt_out_capturing();
    client?.reset();
  } catch {
    /* Best effort SDK cleanup. */
  }
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("ph_") || key.startsWith("_ga"))
        localStorage.removeItem(key);
  } catch {
    /* Storage can be unavailable. */
  }
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=")[0];
    if (!(name.startsWith("_ga") || name.startsWith("ph_"))) continue;
    const parts = location.hostname.split(".");
    // biome-ignore lint/suspicious/noDocumentCookie: delete legacy cookies in browsers without Cookie Store API.
    document.cookie = `${name}=; Max-Age=0; Path=/`;
    for (let index = 0; index < parts.length - 1; index++)
      // biome-ignore lint/suspicious/noDocumentCookie: delete legacy cookies in browsers without Cookie Store API.
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.${parts.slice(index).join(".")}`;
  }
}
