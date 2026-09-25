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
            className="flex flex-col gap-1 rounded border border-gm-border bg-gm-surface p-4 hover:bg-gm-surface-muted lg:p-5"
            href={warningHref(warning.identifier)}
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-gm-warning-grey-bg px-2.5 py-0.5 font-bold text-gm-warning-grey-fg text-label uppercase leading-label tracking-wide">
                {warning.how === "cancelled" ? "Cancelled" : "Ended"}
              </span>
              <span className="font-bold text-body-base text-gm-navy leading-body-base">
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
