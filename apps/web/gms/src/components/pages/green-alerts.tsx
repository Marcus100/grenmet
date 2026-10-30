import { ArrowRightIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { GreenAlerts } from "@/lib/green-alerts";
import { WARNING_LEVEL_SWATCH } from "@/lib/warning-level";

/**
 * Green alerts in effect, in a calm style: a green stripe, the level in words
 * and when it applies. An unreadable feed says so and is never an all-clear;
 * an empty list says no Green alerts are in effect, which is not the same as
 * no alerts at all.
 */
export function GreenAlertList({ green }: { green: GreenAlerts }) {
  if (green.status === "unavailable") {
    return (
      <div className="rounded-gm-card border border-gm-risk-amber bg-gm-surface p-4 lg:p-5">
        <p
          className="text-body text-gm-text-secondary leading-body"
          role="status"
        >
          Green alerts cannot be retrieved right now. This is not an all-clear
          for Green level alerts.
        </p>
      </div>
    );
  }
  const other =
    green.other > 0 ? (
      <p className="text-body-sm text-gm-text-secondary leading-body-sm">
        {green.other === 1
          ? "One other GMS alert is in effect and is not listed here yet."
          : `${green.other} other GMS alerts are in effect and are not listed here yet.`}{" "}
        Check the Grenada Meteorological Service directly.
      </p>
    ) : null;
  const incomplete = green.complete ? null : (
    <p
      className="text-body-sm text-gm-text-secondary leading-body-sm"
      role="status"
    >
      Some alerts could not be read, so this list may be incomplete.
    </p>
  );
  if (green.items.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-gm-card border border-gm-border bg-background p-4 lg:p-5">
        <p className="text-body text-gm-text-secondary leading-body">
          No Green alerts are in effect.
        </p>
        {other}
        {incomplete}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {green.items.map((item) => (
          <li
            className="grid grid-cols-[6px_minmax(0,1fr)] overflow-hidden rounded-gm-card border border-gm-border bg-background"
            key={item.id}
          >
            <span aria-hidden="true" className={WARNING_LEVEL_SWATCH.none} />
            <div className="flex min-w-0 flex-col gap-2 p-4 lg:p-5">
              <p className="font-bold text-gm-text-secondary text-label uppercase leading-label tracking-wider">
                Green level · {item.when}
              </p>
              <p className="font-bold text-gm-heading text-heading-sm leading-heading-sm">
                {item.title}
              </p>
              {item.summary && (
                <p className="text-body-base leading-body-base">
                  {item.summary}
                </p>
              )}
              {item.href && (
                <Link
                  className="flex w-fit items-center gap-1 font-semibold text-body text-gm-blue-ink leading-body hover:underline"
                  href={item.href as Route}
                >
                  Read the full item
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
      {other}
      {incomplete}
    </div>
  );
}
