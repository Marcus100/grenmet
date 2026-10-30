import type { Route } from "next";
import Link from "next/link";
import { type EndedWarning, warningHref } from "@/lib/warning-detail";

/**
 * The explicit all-clear: warnings that ended in the last 24 hours, in the
 * grey "expired" pair, each stating how and when it ended. Renders nothing
 * when none have — an empty section would read as noise.
 */
export function EndedWarnings({ ended }: { ended: EndedWarning[] }) {
  if (ended.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-col gap-2">
      {ended.map((warning) => (
        <li key={warning.identifier}>
          <Link
            className="rounded-gm-card border-gm-border bg-gm-surface hover:bg-gm-surface-muted flex flex-col gap-1 border p-4 lg:p-5"
            href={warningHref(warning.identifier) as Route}
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="bg-gm-warning-grey-bg text-gm-warning-grey-fg text-label leading-label rounded-full px-2.5 py-0.5 font-bold tracking-wide uppercase">
                {warning.how === "cancelled" ? "Cancelled" : "Ended"}
              </span>
              <span className="text-body-base text-gm-heading leading-body-base font-bold">
                {warning.event}
              </span>
            </span>
            <span className="text-body text-gm-text-secondary leading-body">
              {warning.headline}
            </span>
            <span className="text-body-sm text-gm-text-secondary leading-body-sm">
              {warning.how === "cancelled" ? "Cancelled" : "Ended"}{" "}
              {warning.endedAt}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
