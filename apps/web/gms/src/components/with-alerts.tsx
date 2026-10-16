"use client";

import { type ReactNode, Suspense, use } from "react";
import type { AlertsResult } from "@/lib/cap-alerts";

/**
 * The warning feed as the root layout hands it over: a promise the page does
 * not wait for, or (in tests and callers that already awaited) the answer.
 */
export type AlertsSource = AlertsResult | Promise<AlertsResult>;

/** Shown while the feed has not answered. Never an all-clear. */
export const CHECKING_ALERTS = "Checking warnings…";

function isPending(alerts: AlertsSource): alerts is Promise<AlertsResult> {
  return "then" in alerts;
}

function Resolved({
  alerts,
  children,
}: {
  alerts: Promise<AlertsResult>;
  children: (alerts: AlertsResult) => ReactNode;
}) {
  return children(use(alerts));
}

/**
 * Renders `children` with the feed's answer, streaming it in when it arrives.
 * Until then `fallback` shows, so a page never waits on the warning service
 * and never says "No active alerts" before the service has said so.
 */
export function WithAlerts({
  alerts,
  children,
  fallback,
}: {
  alerts: AlertsSource;
  children: (alerts: AlertsResult) => ReactNode;
  fallback: ReactNode;
}) {
  if (!isPending(alerts)) {
    return children(alerts);
  }
  return (
    <Suspense fallback={fallback}>
      <Resolved alerts={alerts}>{children}</Resolved>
    </Suspense>
  );
}
