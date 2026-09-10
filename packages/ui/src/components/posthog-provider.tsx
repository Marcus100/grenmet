"use client";

import { usePathname } from "next/navigation";
import posthog, { type CaptureResult } from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { Suspense, useEffect, useState } from "react";

const PAGE_SECTIONS = new Set([
  "home",
  "cap",
  "wxproducts",
  "wxwatch",
  "weather",
  "forecast",
  "marine",
  "aviation",
  "climate",
  "news",
  "alerts",
  "about",
  "contact",
  "security",
  "sign-in",
  "sign-up",
  "other",
]);

/** Allow page counts only, excluding arbitrary properties, URLs and content. */
export function filterAnalyticsEvent(
  event: CaptureResult | null
): CaptureResult | null {
  if (event?.event !== "$pageview") return null;
  const properties = event.properties;
  return {
    uuid: event.uuid,
    event: event.event,
    timestamp: event.timestamp,
    properties: {
      page_section: PAGE_SECTIONS.has(properties.page_section)
        ? properties.page_section
        : "other",
      token: properties.token,
      distinct_id: properties.distinct_id,
      $lib: properties.$lib,
      $lib_version: properties.$lib_version,
      $process_person_profile: false,
      $geoip_disable: true,
    },
  };
}

function PostHogPageView() {
  const pathname = usePathname();
  const ph = usePostHog();

  useEffect(() => {
    if (pathname && ph) {
      const section = pathname.split("/")[1] || "home";
      ph.capture("$pageview", {
        page_section: PAGE_SECTIONS.has(section) ? section : "other",
      });
    }
  }, [pathname, ph]);

  return null;
}

interface PostHogProviderProps {
  apiHost: string;
  apiKey: string;
  children: React.ReactNode;
}

export function PostHogProvider({
  apiKey,
  apiHost,
  children,
}: PostHogProviderProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!apiKey) return;
    if (posthog.__loaded) {
      setReady(true);
      return;
    }
    posthog.init(apiKey, {
      api_host: apiHost,
      defaults: "2026-01-30",
      person_profiles: "never",
      capture_pageview: false,
      capture_pageleave: false,
      autocapture: false,
      capture_exceptions: false,
      disable_session_recording: true,
      disable_surveys: true,
      before_send: filterAnalyticsEvent,
      loaded: () => setReady(true),
    });
  }, [apiKey, apiHost]);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        {ready && apiKey ? <PostHogPageView /> : null}
      </Suspense>
      {children}
    </PHProvider>
  );
}
