import type { PrintixEventAnalytics } from "@barrelsgd/api-client";
import {
  count,
  durationWords,
  REFUSAL_WORDS,
  refusalLabel,
} from "@/organiser/analytics-format";

interface RefusalsPanelProps {
  readonly analytics: PrintixEventAnalytics;
}

/** Refusals by reason, and the admissions made without a connection. */
export function RefusalsPanel({ analytics }: RefusalsPanelProps) {
  const { refusals, offline } = analytics;
  const total = refusals.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <section
        aria-labelledby="refusals-title"
        className="bg-px-surface border-px-rule flex flex-col gap-2 rounded-2xl border p-4"
      >
        <h4 className="text-lg font-semibold" id="refusals-title">
          Refused scans, by reason
        </h4>
        <ul className="flex flex-col gap-2">
          {refusals.map((item) => (
            <li className="flex flex-col" key={item.reason}>
              <span className="flex justify-between gap-3">
                <span>{refusalLabel(item.reason)}</span>
                <span className="font-semibold tabular-nums">
                  {count(item.count)}
                </span>
              </span>
              <span className="text-px-muted text-xs">
                {REFUSAL_WORDS[item.reason]?.hint}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-px-muted text-sm">
          {total === 0
            ? "No scan has been refused yet."
            : `${count(total)} refused in all.`}
        </p>
      </section>

      <section
        aria-labelledby="offline-title"
        className="bg-px-surface border-px-rule flex flex-col gap-2 rounded-2xl border p-4"
      >
        <h4 className="text-lg font-semibold" id="offline-title">
          Scans made without a connection
        </h4>
        <dl className="flex flex-col gap-2">
          <div className="flex justify-between gap-3">
            <dt>Sent late and let in</dt>
            <dd className="font-semibold tabular-nums">
              {count(offline.synced_late)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Conflicts</dt>
            <dd className="font-semibold tabular-nums">
              {count(offline.conflicts)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Longest wait before sending</dt>
            <dd className="font-semibold tabular-nums">
              {offline.longest_delay_seconds === null ||
              offline.longest_delay_seconds === undefined
                ? "None yet"
                : durationWords(offline.longest_delay_seconds)}
            </dd>
          </div>
        </dl>
        <p className="text-px-muted text-xs">
          A conflict is a scan made without a connection that the server could
          not record as a new admission, because the ticket was already in,
          void, not recognised, or the event had closed. The person was let in
          at the gate.
        </p>
      </section>
    </div>
  );
}
