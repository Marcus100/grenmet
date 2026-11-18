import type { PrintixScanPage } from "@barrelsgd/api-client";
import {
  count,
  entryWords,
  numberWords,
  outcomeWords,
  timeWithSeconds,
} from "@/organiser/analytics-format";

interface RecentScansProps {
  readonly scans: PrintixScanPage;
}

/** The latest scans, newest first: when, where, which printed number, and what happened. */
export function RecentScans({ scans }: RecentScansProps) {
  return (
    <section aria-labelledby="recent-title" className="flex flex-col gap-3">
      <h4 className="text-lg font-semibold" id="recent-title">
        Recent scans
      </h4>
      {scans.items.length === 0 ? (
        <p className="bg-px-surface text-px-muted rounded-2xl px-4 py-3 text-base">
          No scans yet. The latest {count(scans.size)} appear here as gates
          scan.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {scans.items.map((scan) => (
              <li
                className="bg-px-surface border-px-rule grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-2xl border px-4 py-3 text-sm sm:grid-cols-[auto_1fr_auto]"
                key={scan.id}
              >
                <span className="text-px-muted tabular-nums">
                  {timeWithSeconds(scan.scanned_at)}
                </span>
                <span className="font-semibold break-words">
                  {outcomeWords(scan.outcome)}
                </span>
                <span className="text-px-muted col-span-2 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                  {scan.gate}
                </span>
                <span className="col-span-2 flex flex-wrap gap-x-3">
                  <span className="font-mono">{numberWords(scan)}</span>
                  <span className="text-px-muted">{entryWords(scan)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-px-muted text-sm">
            Showing the latest {count(scans.items.length)} of{" "}
            {count(scans.total)} scans. Times are Grenada time. A scan sent late
            shows the time it was made at the gate.
          </p>
        </>
      )}
    </section>
  );
}
