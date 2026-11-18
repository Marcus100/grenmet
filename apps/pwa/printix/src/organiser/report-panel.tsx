import type { PrintixEventAnalytics } from "@barrelsgd/api-client";
import { useState } from "react";
import { downloadScanList } from "@/organiser/analytics-api";
import {
  count,
  percent,
  scanListFileName,
  timeOf,
} from "@/organiser/analytics-format";
import { type Problem, problemMessage } from "@/organiser/errors";
import { isEventClosed } from "@/organiser/event-state";
import { formatMoment } from "@/organiser/format";
import type { OrganiserSession } from "@/organiser/session";
import { ALERT, BUTTON_SECONDARY } from "@/organiser/styles";

interface ReportPanelProps {
  readonly analytics: PrintixEventAnalytics;
  readonly onAnnounce: (text: string) => void;
  readonly organisationId: string;
  readonly session: OrganiserSession;
}

const REVOKE_AFTER_MS = 10_000;

/** Saves text as a file on this device. */
function saveText(text: string, fileName: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Not at once: some older browsers lose the download if the address goes first.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

/** The after-event report: totals, who did not come, the busiest times, each gate's share. */
export function ReportPanel({
  analytics,
  session,
  organisationId,
  onAnnounce,
}: ReportPanelProps) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const closed = isEventClosed(
    analytics.event,
    new Date(analytics.generated_at)
  );
  const busiest = analytics.busiest_15_minutes;
  const withShare = analytics.gates.filter((gate) => gate.admitted > 0);

  const download = async () => {
    setBusy(true);
    setProblem(null);
    const outcome = await downloadScanList(
      session,
      organisationId,
      analytics.event.id
    );
    setBusy(false);
    if (!outcome.ok) {
      setProblem(outcome.problem);
      return;
    }
    saveText(outcome.value, scanListFileName(analytics.event.event_date));
    onAnnounce("The scan list was saved to this device.");
  };

  return (
    <section
      aria-labelledby="report-title"
      className="bg-px-surface border-px-rule flex flex-col gap-4 rounded-2xl border p-4"
    >
      <div className="flex flex-col gap-1">
        <h4 className="text-lg font-semibold" id="report-title">
          After the event
        </h4>
        <p className="text-px-muted text-sm">
          {closed
            ? "The event has closed, so these numbers are final."
            : "These numbers are for now and change until the event closes."}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Stat label="Tickets issued" value={count(analytics.issued)} />
        <Stat label="Void tickets" value={count(analytics.void)} />
        <Stat label="People let in" value={count(analytics.admitted)} />
        <Stat
          hint={
            closed
              ? "Valid tickets that were never used."
              : "Valid tickets not used yet."
          }
          label={closed ? "No-shows" : "Not in yet"}
          value={`${count(analytics.not_yet_in)} (${percent(analytics.no_show_rate)})`}
        />
        <Stat
          label="First let in"
          value={
            analytics.first_admission_at
              ? timeOf(analytics.first_admission_at)
              : "No one yet"
          }
        />
        <Stat
          label="Last let in"
          value={
            analytics.last_admission_at
              ? timeOf(analytics.last_admission_at)
              : "No one yet"
          }
        />
        <Stat
          hint={
            busiest
              ? `From ${timeOf(busiest.starts_at)}, ${formatMoment(busiest.starts_at)}.`
              : "Shown once people arrive."
          }
          label="Busiest 15 minutes"
          value={busiest ? `${count(busiest.admitted)} people` : "No one yet"}
        />
      </dl>

      <div className="flex flex-col gap-2">
        <h5 className="text-base font-semibold">Share of arrivals by gate</h5>
        {withShare.length === 0 ? (
          <p className="text-px-muted text-sm">
            No one has been let in yet, so there are no shares to show.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {withShare.map((gate) => (
              <li className="flex flex-col gap-1" key={gate.gate}>
                <span className="flex justify-between gap-3 text-sm">
                  <span className="break-words">{gate.gate}</span>
                  <span className="tabular-nums">
                    {percent(gate.admitted_share)} ({count(gate.admitted)})
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="bg-px-rule block h-2 w-full overflow-hidden rounded-full"
                >
                  <span
                    className="bg-px-green block h-full rounded-full"
                    style={{
                      width: `${Math.round((gate.admitted_share ?? 0) * 100)}%`,
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h5 className="text-base font-semibold">Scan list</h5>
        <p className="text-px-muted text-sm">
          Every scan as a spreadsheet file (CSV): time, gate, printed number,
          what happened, and whether it was typed or sent late. Printed numbers
          only; barcodes are never included.
        </p>
        <button
          className={`${BUTTON_SECONDARY} w-full sm:w-fit`}
          disabled={busy}
          onClick={download}
          type="button"
        >
          {busy ? "Preparing the scan list…" : "Save the scan list"}
        </button>
        {problem ? (
          <p className={ALERT} role="alert">
            {problemMessage(problem)}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-px-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {hint ? <dd className="text-px-muted text-xs">{hint}</dd> : null}
    </div>
  );
}
