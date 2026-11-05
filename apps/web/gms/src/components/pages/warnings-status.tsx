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
