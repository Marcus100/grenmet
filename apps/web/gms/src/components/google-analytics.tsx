"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    dataLayer?: unknown[][];
  }
}

const MEASUREMENT_ID = /^G-[A-Z0-9]+$/;

function gtag(...args: unknown[]) {
  window.dataLayer ??= [];
  window.dataLayer.push(args);
}

/** Public pages only. Do not mount in authentication or staff applications. */
export function GoogleAnalytics({
  measurementId,
  environment,
}: {
  measurementId: string;
  environment: string;
}) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const validId = MEASUREMENT_ID.test(measurementId);

  useEffect(() => {
    if (!(ready && validId && pathname)) return;
    // Group dynamic pages; never transmit query strings, fragments or referrers.
    const section = pathname.split("/")[1] ?? "";
    const safeSection = [
      "",
      "weather",
      "forecast",
      "marine",
      "aviation",
      "climate",
      "news",
      "alerts",
      "about",
      "contact",
    ].includes(section)
      ? section
      : "other";
    gtag("event", "page_view", {
      send_to: measurementId,
      page_location: `${window.location.origin}/${safeSection}`,
      page_title: safeSection || "home",
      page_referrer: "",
      debug_mode: environment !== "production",
    });
  }, [ready, validId, pathname, measurementId, environment]);

  if (!validId) return null;
  return (
    <Script
      id="gms-google-analytics"
      onReady={() => {
        gtag("js", new Date());
        gtag("config", measurementId, {
          send_page_view: false,
          allow_google_signals: false,
          allow_ad_personalization_signals: false,
          page_location: window.location.origin,
          page_referrer: "",
        });
        setReady(true);
      }}
      src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      strategy="afterInteractive"
    />
  );
}
