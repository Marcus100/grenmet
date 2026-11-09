import type { Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { fetchPastAlertsResult } from "@/lib/cap";
import { recentlyEnded, warningHref } from "@/lib/warning-detail";

export const metadata = {
  title: "Past alerts",
  description:
    "Warnings from the Grenada Meteorological Service that have ended in the last 30 days.",
};

/** How far back the page looks. */
const PAST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export default async function PastAlertsPage() {
  const result = await fetchPastAlertsResult();
  const ended =
    result.status === "ok"
      ? recentlyEnded(result.alerts, new Date(), PAST_WINDOW_MS)
      : [];

  return (
    <>
      <PageHeader
        description="Warnings that have expired or been cancelled in the last 30 days, newest first."
        title="Past alerts"
      />
      <PageSection heading="Ended in the last 30 days">
        {result.status === "unavailable" ? (
          <p className="rounded-gm-card border-gm-risk-amber bg-gm-surface text-body text-gm-text-secondary leading-body border p-4 lg:p-5">
            Past warnings cannot be retrieved right now. This does not mean
            there were none — check the Grenada Meteorological Service directly.
          </p>
        ) : null}
        {result.status === "ok" && ended.length === 0 ? (
          <p className="rounded-gm-card border-gm-border bg-background text-body text-gm-text-secondary leading-body border p-4 lg:p-5">
            No warning has ended in the last 30 days.
          </p>
        ) : null}
        {ended.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {ended.map((warning) => (
              <li key={warning.identifier}>
                <Link
                  className="rounded-gm-card border-gm-border bg-background hover:border-gm-blue-ink focus-visible:border-gm-blue-ink flex flex-col gap-1 border p-4 lg:p-5"
                  href={warningHref(warning.identifier) as Route}
                >
                  <span className="text-gm-text-secondary text-label leading-label font-bold tracking-wider uppercase">
                    {warning.how === "cancelled" ? "Cancelled" : "Expired"}
                    {" · "}
                    {warning.endedAt}
                  </span>
                  <span className="text-gm-heading text-heading-sm leading-heading-sm font-bold">
                    {warning.event}
                  </span>
                  <span className="text-body-base leading-body-base">
                    {warning.headline}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-body leading-body mt-4">
          <Link
            className="text-gm-blue-ink font-semibold underline"
            href="/alerts"
          >
            See the alerts in effect now
          </Link>
        </p>
      </PageSection>
    </>
  );
}
