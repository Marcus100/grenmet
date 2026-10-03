import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { type AlertsResult, alertsLevel, severityLevel } from "@/lib/cap";
import { formatWarningTime, warningHref } from "@/lib/warning-detail";

/**
 * Red "take action now" band above the sky hero. Renders only when a live
 * CAP alert (status Actual) is at the take-action level, and shows exactly
 * what the alert says — never a sample. Lower levels stay in the ribbon.
 */
export function WarningTakeover({ alerts }: { alerts: AlertsResult }) {
  if (alerts.status !== "ok" || alertsLevel(alerts) !== "take-action") {
    return null;
  }
  const urgent = alerts.groups
    .flatMap((group) => group.alerts)
    .filter(
      (alert) =>
        alert.status === "Actual" &&
        severityLevel(alert.severity) === "take-action"
    );

  return (
    <section
      aria-labelledby="takeover-title"
      className="border-gm-risk-red border-b-6 bg-background"
    >
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6 xl:px-8">
        <p className="flex w-fit items-center gap-2 rounded bg-gm-warning-red-bg px-2.5 py-1 font-bold text-gm-warning-red-fg text-label uppercase leading-label tracking-wider">
          <TriangleAlertIcon aria-hidden="true" className="size-4" />
          Take action now
        </p>
        <h2
          className="text-balance font-bold font-gm-display text-gm-display text-gm-heading uppercase tracking-wide"
          id="takeover-title"
        >
          {urgent.length === 1
            ? urgent[0].event
            : `${urgent.length} warnings need action now`}
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {urgent.map((alert) => (
            <li
              className="rounded-gm-card border border-gm-border border-l-6 border-l-gm-risk-red p-4"
              key={alert.identifier}
            >
              <p className="font-bold text-body-base text-gm-heading leading-body-base">
                {alert.headline}
              </p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body leading-body">
                <dt className="font-semibold text-gm-text-secondary">Where</dt>
                <dd>
                  {alert.areas.length > 0
                    ? alert.areas.join(", ")
                    : "Grenada, Carriacou and Petite Martinique"}
                </dd>
                <dt className="font-semibold text-gm-text-secondary">Until</dt>
                <dd>
                  {formatWarningTime(alert.expires) ?? "Until further notice"}
                </dd>
              </dl>
              <Link
                className="mt-3 inline-flex h-11 items-center rounded-md bg-gm-warning-red-bg px-4 font-bold text-body text-gm-warning-red-fg leading-body"
                href={warningHref(alert.identifier)}
              >
                Read the warning
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
