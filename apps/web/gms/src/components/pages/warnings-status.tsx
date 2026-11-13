import { Suspense } from "react";
import { AlertGroups } from "@/components/pages/alert-groups";
import { GreenAlertList } from "@/components/pages/green-alerts";
import { WarningStatusBand } from "@/components/pages/warning-status-band";
import type { AlertsResult, GreenStatus } from "@/lib/cap-alerts";
import type { GreenAlerts } from "@/lib/green-alerts";
import { greenStatus } from "@/lib/green-alerts";

/*
 * The /alerts page's parts, each its own server component so a slow GMS
 * outlook never holds back the CAP warnings. Only the parts whose wording
 * depends on the outlook await it, and only when no warning is in effect
 * (where "No active alerts" would otherwise be said). Each part streams in
 * behind its own Suspense boundary on the page.
 */

/** The outlook's counts, awaited only where they decide the wording. */
async function outlookFor(
  alerts: AlertsResult,
  green: Promise<GreenAlerts>
): Promise<GreenStatus | undefined> {
  if (alerts.status !== "ok" || alerts.activeCount > 0) {
    return undefined;
  }
  return greenStatus(await green);
}

/**
 * The warnings list's empty line. "No alerts in effect" is said only when
 * nothing at all is in effect, so it is never used while anything is listed
 * or cannot be checked. `undefined` keeps the default wording.
 */
export function noWarningsLabel(
  status: GreenStatus | undefined
): string | undefined {
  if (!status) {
    return undefined;
  }
  if (status.status === "unavailable") {
    return "No warnings or watches are in effect. Green alerts could not be checked right now.";
  }
  if (status.other > 0) {
    return "No warnings or watches are in effect. Other GMS alerts are in effect; see below.";
  }
  if (!status.complete && status.count === 0) {
    return "No warnings or watches are in effect. Some alerts could not be read, so this may be incomplete.";
  }
  if (status.count > 0) {
    return "No warnings or watches are in effect. Green alerts are listed below.";
  }
  return undefined;
}

/** The status band at the top of the page. */
export async function WarningsBand({
  alerts,
  checkedAt,
  green,
}: {
  alerts: AlertsResult;
  checkedAt: Date;
  green: Promise<GreenAlerts>;
}) {
  return (
    <WarningStatusBand
      alerts={alerts}
      checkedAt={checkedAt}
      green={await outlookFor(alerts, green)}
    />
  );
}

/** The CAP warnings, grouped; its empty line depends on the outlook. */
export async function CapGroups({
  alerts,
  green,
}: {
  alerts: AlertsResult;
  green: Promise<GreenAlerts>;
}) {
  const status = await outlookFor(alerts, green);
  return <AlertGroups emptyLabel={noWarningsLabel(status)} result={alerts} />;
}

/** Green alerts in effect, and the other GMS alerts not yet warnings. */
export async function GreenSection({ green }: { green: Promise<GreenAlerts> }) {
  return <GreenAlertList green={await green} />;
}

/** True only when both lists were read in full and hold nothing. */
function nothingInEffect(
  alerts: AlertsResult,
  status: GreenStatus | undefined
): boolean {
  return (
    alerts.status === "ok" &&
    alerts.activeCount === 0 &&
    status !== undefined &&
    status.status !== "unavailable" &&
    status.complete &&
    status.count === 0 &&
    status.other === 0
  );
}

const CHECKLIST_ROW = "flex flex-wrap gap-x-2";

/**
 * The page's two lists. When nothing at all is in effect they are one short
 * checklist (owner, 13 Nov 2026: say it once, keep both lists visible).
 * Otherwise the warnings show at once and the Green alerts stream in behind
 * their own boundary, so a slow outlook never holds back a warning.
 */
export async function AlertLists({
  alerts,
  green,
}: {
  alerts: AlertsResult;
  green: Promise<GreenAlerts>;
}) {
  const status = await outlookFor(alerts, green);
  if (nothingInEffect(alerts, status)) {
    return (
      <dl
        aria-label="Alerts checked"
        className="rounded-gm-card border-gm-border text-body-base leading-body-base flex flex-col gap-1 border p-4"
      >
        <div className={CHECKLIST_ROW}>
          <dt className="text-gm-heading font-bold">Warnings and watches:</dt>
          <dd>none in effect</dd>
        </div>
        <div className={CHECKLIST_ROW}>
          <dt className="text-gm-heading font-bold">Green alerts:</dt>
          <dd>none in effect</dd>
        </div>
      </dl>
    );
  }
  return (
    <>
      <AlertGroups emptyLabel={noWarningsLabel(status)} result={alerts} />
      <section
        aria-labelledby="green-alerts-heading"
        className="flex flex-col gap-3"
      >
        <h2
          className="text-gm-heading text-heading-sm leading-heading-sm font-bold"
          id="green-alerts-heading"
        >
          Green alerts
        </h2>
        <Suspense fallback={<p role="status">Checking the GMS alerts…</p>}>
          <GreenSection green={green} />
        </Suspense>
      </section>
    </>
  );
}
