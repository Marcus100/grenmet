import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AlertGroups } from "@/components/pages/alert-groups";
import { EndedWarnings } from "@/components/pages/ended-warnings";
import { ExerciseBanner } from "@/components/pages/exercise-banner";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { WarningLegend } from "@/components/pages/warning-legend";
import { WarningStatusBand } from "@/components/pages/warning-status-band";
import { alertsLevel, fetchActiveAlerts, fetchPastAlerts } from "@/lib/cap";
import { recentlyEnded } from "@/lib/warning-detail";

export const metadata = {
  title: "Warnings in effect",
  description:
    "Every weather warning and advisory in effect for Grenada, Carriacou and Petite Martinique.",
};

export default async function WarningsPage() {
  const [alerts, past] = await Promise.all([
    fetchActiveAlerts(),
    fetchPastAlerts(),
  ]);
  const ended = recentlyEnded(past, new Date());

  return (
    <>
      <PageHeader
        description="Every warning and advisory in effect right now, grouped by hazard."
        title="Warnings in effect"
      />
      <ExerciseBanner result={alerts} />
      <WarningStatusBand alerts={alerts} checkedAt={new Date()} />
      <div className="mb-8 grid gap-5 lg:mb-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          <AlertGroups result={alerts} />
          {alertsLevel(alerts) === "none" && (
            <div className="flex flex-col gap-1 rounded-gm-card border border-gm-border border-dashed p-4 text-body leading-body">
              <b className="text-gm-navy">What we are watching</b>
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
            "This page reflects the CAP feed published by GMS. If the feed cannot be reached, this page says so rather than showing an empty list — an unreachable feed is not the same as an all-clear.",
          ]}
        />
      </PageSection>
    </>
  );
}
