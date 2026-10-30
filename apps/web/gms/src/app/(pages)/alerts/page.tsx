import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AlertGroups } from "@/components/pages/alert-groups";
import { EndedWarnings } from "@/components/pages/ended-warnings";
import { ExerciseBanner } from "@/components/pages/exercise-banner";
import { GreenAlertList } from "@/components/pages/green-alerts";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { WarningLegend } from "@/components/pages/warning-legend";
import { WarningStatusBand } from "@/components/pages/warning-status-band";
import { alertsLevel, fetchActiveAlerts, fetchPastAlerts } from "@/lib/cap";
import { type GreenAlerts, greenAlerts } from "@/lib/green-alerts";
import { fetchSectorOutlook } from "@/lib/products";
import { recentlyEnded } from "@/lib/warning-detail";

export const metadata = {
  title: "Alerts in effect",
  description:
    "Every weather alert in effect for Grenada, Carriacou and Petite Martinique: warnings, watches, advisories and Green alerts.",
};

/**
 * The warnings list's empty line. "No alerts in effect" is said only when
 * nothing at all is in effect, so it is never used while Green alerts are
 * listed or cannot be checked. `undefined` keeps the default wording.
 */
function noWarningsLabel(green: GreenAlerts): string | undefined {
  if (green.status === "unavailable") {
    return "No warnings or watches are in effect. Green alerts could not be checked right now.";
  }
  if (green.items.length > 0) {
    return "No warnings or watches are in effect. Green alerts are listed below.";
  }
  return undefined;
}

export default async function WarningsPage() {
  const [alerts, past, outlook] = await Promise.all([
    fetchActiveAlerts(),
    fetchPastAlerts(),
    fetchSectorOutlook(),
  ]);
  const now = new Date();
  const ended = recentlyEnded(past, now);
  const green = greenAlerts(outlook, alerts, now);
  const noWarnings = noWarningsLabel(green);

  return (
    <>
      <PageHeader
        description="Every warning, watch and advisory in effect right now, grouped by hazard. Green alerts are listed too."
        title="Alerts in effect"
      />
      <ExerciseBanner result={alerts} />
      <WarningStatusBand alerts={alerts} checkedAt={now} green={green} />
      <div className="mb-8 grid gap-5 lg:mb-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          <AlertGroups emptyLabel={noWarnings} result={alerts} />
          <section
            aria-labelledby="green-alerts-heading"
            className="flex flex-col gap-3"
          >
            <h2
              className="font-bold text-gm-heading text-heading-sm leading-heading-sm"
              id="green-alerts-heading"
            >
              Green alerts
            </h2>
            <GreenAlertList green={green} />
          </section>
          {alertsLevel(alerts) === "none" && (
            <div className="flex flex-col gap-1 rounded-gm-card border border-gm-border border-dashed p-4 text-body leading-body">
              <b className="text-gm-heading">What we are watching</b>
              <span>
                The tropical weather outlook covers systems that could affect us
                over the next seven days.
              </span>
              <Link
                className="flex w-fit items-center gap-1 font-semibold text-gm-blue-ink hover:underline"
                href="/weather/tropics"
              >
                Tropical weather outlook
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </Link>
            </div>
          )}
        </div>
        <WarningLegend />
      </div>
      {ended.length > 0 && (
        <PageSection heading="Ended in the last 24 hours">
          <EndedWarnings ended={ended} />
        </PageSection>
      )}
      <PageSection heading="How to use this page">
        <Prose
          paragraphs={[
            "Warnings are listed by hazard and, within each hazard, most severe first. Select a warning for what to expect, what to do, where and when. A warning stays here until it expires or the Grenada Meteorological Service cancels it, then shows under “Ended” for 24 hours as the all-clear.",
            "This page reflects the CAP feed published by GMS. If the feed cannot be reached, this page says so rather than showing an empty list — an unreachable feed is not the same as an all-clear. Green alerts are listed in their own section, with the same rule: an unreadable list is said, never shown as none.",
          ]}
        />
      </PageSection>
    </>
  );
}
