import { useCallback } from "react";
import { readDashboard } from "@/organiser/analytics-api";
import { count } from "@/organiser/analytics-format";
import { ArrivalsChart } from "@/organiser/arrivals-chart";
import { problemMessage } from "@/organiser/errors";
import { formatClock } from "@/organiser/format";
import { GatesPanel } from "@/organiser/gates-panel";
import { RecentScans } from "@/organiser/recent-scans";
import { RefusalsPanel } from "@/organiser/refusals-panel";
import { ReportPanel } from "@/organiser/report-panel";
import type { OrganiserSession } from "@/organiser/session";
import { ALERT } from "@/organiser/styles";
import { usePolledRead } from "@/organiser/use-polled-read";

const rate = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

interface AnalyticsSectionProps {
  readonly eventId: string;
  readonly onAnnounce: (text: string) => void;
  readonly organisationId: string;
  readonly session: OrganiserSession;
}

/**
 * The live dashboard and the after-event report for one event. Every part is always
 * shown, with a sentence when there is nothing to count yet. Refreshes every 10
 * seconds with the rest of the page.
 */
export function AnalyticsSection({
  session,
  organisationId,
  eventId,
  onAnnounce,
}: AnalyticsSectionProps) {
  const load = useCallback(
    () => readDashboard(session, organisationId, eventId),
    [session, organisationId, eventId]
  );
  const { value, problem, updatedAt } = usePolledRead(load);

  return (
    <section aria-labelledby="live-title" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold" id="live-title">
          Live at the gates
        </h3>
        <p className="text-px-muted text-sm">
          {updatedAt
            ? `Live numbers as of ${formatClock(updatedAt)}, Grenada time.`
            : "Reading the live numbers."}
        </p>
      </div>

      {problem ? (
        <p className={ALERT} role="alert">
          {problemMessage(problem)}
        </p>
      ) : null}

      {value ? (
        <>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Pace
              hint="People let in during the last 10 minutes."
              label="In the last 10 minutes"
              value={count(value.analytics.admitted_last_10_minutes)}
            />
            <Pace
              hint="Last 10 minutes, per minute."
              label="Entry rate"
              value={`${rate.format(value.analytics.entry_rate_per_minute)} a minute`}
            />
            <Pace
              hint="The busiest five minutes so far."
              label="Peak"
              value={
                value.analytics.busiest_5_minutes
                  ? `${count(value.analytics.busiest_5_minutes.admitted)} people`
                  : "No one yet"
              }
            />
          </dl>
          <ArrivalsChart analytics={value.analytics} />
          <GatesPanel analytics={value.analytics} />
          <RefusalsPanel analytics={value.analytics} />
          <RecentScans scans={value.scans} />
          <ReportPanel
            analytics={value.analytics}
            onAnnounce={onAnnounce}
            organisationId={organisationId}
            session={session}
          />
        </>
      ) : null}

      {value || problem ? null : (
        <p className="text-px-muted text-base" role="status">
          Loading the live numbers…
        </p>
      )}
    </section>
  );
}

function Pace({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
}) {
  return (
    <div className="bg-px-surface border-px-rule flex flex-col gap-1 rounded-2xl border p-4">
      <dt className="text-px-muted text-sm">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      <dd className="text-px-muted text-xs">{hint}</dd>
    </div>
  );
}
