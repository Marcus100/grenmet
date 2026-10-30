"use client";

import { type ReactNode, Suspense, use } from "react";
import type { AlertsResult, GreenStatus } from "@/lib/cap-alerts";

/**
 * The warning feed as the root layout hands it over: a promise the page does
 * not wait for, or (in tests and callers that already awaited) the answer.
 */
export type AlertsSource = AlertsResult | Promise<AlertsResult>;

/** The GMS outlook's Green/other counts, the same way: a promise or the answer. */
export type GreenSource = GreenStatus | Promise<GreenStatus>;

/** Shown while the feed has not answered. Never an all-clear. */
export const CHECKING_ALERTS = "Checking warnings…";

function isPending<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

function Resolved<T>({
  source,
  children,
}: {
  source: Promise<T>;
  children: (value: T) => ReactNode;
}) {
  return children(use(source));
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
      <Resolved source={alerts}>{children}</Resolved>
    </Suspense>
  );
}

/**
 * The masthead's status: the CAP warnings with the GMS outlook's Green counts.
 * A warning shows at once: its wording never needs the outlook, so the outlook
 * is awaited only when no warning is in effect (the one case where "No active
 * alerts" or "Green alert in effect" must be said).
 */
export function WithStatus({
  alerts,
  green,
  children,
  fallback,
}: {
  alerts: AlertsSource;
  green: GreenSource;
  children: (alerts: AlertsResult, green: GreenStatus | undefined) => ReactNode;
  fallback: ReactNode;
}) {
  return (
    <WithAlerts alerts={alerts} fallback={fallback}>
      {(cap) => {
        if (cap.status !== "ok" || cap.activeCount > 0) {
          return children(cap, undefined);
        }
        if (!isPending(green)) {
          return children(cap, green);
        }
        return (
          <Suspense fallback={fallback}>
            <Resolved source={green}>
              {(value) => children(cap, value)}
            </Resolved>
          </Suspense>
        );
      }}
    </WithAlerts>
  );
}
