import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { EndedWarnings } from "@/components/pages/ended-warnings";
import { ExerciseBanner } from "@/components/pages/exercise-banner";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { WarningLegend } from "@/components/pages/warning-legend";
import { AlertLists, WarningsBand } from "@/components/pages/warnings-status";
import { alertsLevel, fetchActiveAlerts, fetchPastAlerts } from "@/lib/cap";
import { fetchGreenAlerts } from "@/lib/green-status";
import { recentlyEnded } from "@/lib/warning-detail";

export const metadata = {
  title: "Alerts in effect",
  description:
    "Every weather alert in effect for Grenada, Carriacou and Petite Martinique: warnings, watches, advisories and GMS alerts (green level).",
};

/** Placeholders keep the layout still while a part waits on the GMS outlook. */
const CHECKING = "Checking the GMS alerts…";

export default async function WarningsPage() {
  // Only the CAP warnings and the archive are awaited. The outlook is read
  // in parts behind their own boundaries, so a slow outlook cannot hold back
  // a warning.
  const [alerts, past] = await Promise.all([
    fetchActiveAlerts(),
    fetchPastAlerts(),
  ]);
  const now = new Date();
  const ended = recentlyEnded(past, now);
  const green = fetchGreenAlerts();

  return (
    <>
      <PageHeader
        description="Every warning, watch and advisory in effect right now, grouped by hazard. GMS alerts (green level) are listed too."
        title="Alerts in effect"
      />
      <ExerciseBanner result={alerts} />
      <Suspense
        fallback={
          <p
            className="rounded-gm-card border-gm-border mb-6 border p-5"
            role="status"
          >
            {CHECKING}
          </p>
        }
      >
        <WarningsBand alerts={alerts} checkedAt={now} green={green} />
      </Suspense>
      <div className="mb-8 grid gap-5 lg:mb-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          <Suspense fallback={<p role="status">{CHECKING}</p>}>
            <AlertLists alerts={alerts} green={green} />
          </Suspense>
          {alertsLevel(alerts) === "none" && (
            <div className="rounded-gm-card border-gm-border text-body leading-body flex flex-col gap-1 border p-4">
              <b className="text-gm-heading">What we are watching</b>
              <span>
                The tropical weather outlook covers systems that could affect us
                over the next seven days.
              </span>
              <Link
                className="text-gm-blue-ink flex w-fit items-center gap-1 font-semibold hover:underline"
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
            "If we cannot read our warning feed or the Green alerts, this page says so. A list we could not read is never an all-clear.",
          ]}
        />
      </PageSection>
    </>
  );
}
