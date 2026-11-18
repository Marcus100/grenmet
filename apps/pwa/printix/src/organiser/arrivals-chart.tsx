import type { PrintixEventAnalytics } from "@barrelsgd/api-client";
import {
  arrivalsSummary,
  count,
  peakIndex,
  timeOf,
} from "@/organiser/analytics-format";

/** Bars are laid out in at least this many columns, so a few bars stay slim. */
const MIN_COLUMNS = 12;
const COLUMN = 10;
const BAR = 8;
const HEIGHT = 100;

interface ArrivalsChartProps {
  readonly analytics: PrintixEventAnalytics;
}

/**
 * People let in per five minutes, as plain SVG bars (no charting package). The
 * picture is described twice for people who cannot see it: a sentence beside it
 * and a table of every period behind a disclosure.
 */
export function ArrivalsChart({ analytics }: ArrivalsChartProps) {
  const { arrivals } = analytics;
  const most = Math.max(1, ...arrivals.map((bucket) => bucket.admitted));
  const peak = peakIndex(arrivals);
  const columns = Math.max(MIN_COLUMNS, arrivals.length);
  const summary = arrivalsSummary(analytics);
  const first = arrivals.at(0);
  const last = arrivals.at(-1);

  return (
    <section
      aria-labelledby="arrivals-title"
      className="bg-px-surface border-px-rule flex flex-col gap-3 rounded-2xl border p-4"
    >
      <h4 className="text-lg font-semibold" id="arrivals-title">
        Arrivals every 5 minutes
      </h4>
      <svg
        aria-label={`Bar chart of people let in every five minutes. ${summary}`}
        className="h-40 w-full"
        preserveAspectRatio="none"
        role="img"
        viewBox={`0 0 ${columns * COLUMN} ${HEIGHT}`}
      >
        <line
          className="stroke-px-rule"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          x1={0}
          x2={columns * COLUMN}
          y1={HEIGHT}
          y2={HEIGHT}
        />
        {arrivals.map((bucket, index) => {
          if (bucket.admitted === 0) {
            return null;
          }
          const height = (bucket.admitted / most) * HEIGHT;
          return (
            <rect
              className={index === peak ? "fill-px-paper" : "fill-px-green"}
              height={height}
              key={bucket.starts_at}
              width={BAR}
              x={index * COLUMN}
              y={HEIGHT - height}
            />
          );
        })}
      </svg>
      <div className="text-px-muted flex justify-between gap-3 text-xs tabular-nums">
        <span>{first ? timeOf(first.starts_at) : "Start"}</span>
        <span>Grenada time. One bar is five minutes.</span>
        <span>{last ? timeOf(last.starts_at) : "Now"}</span>
      </div>
      <p className="text-base">{summary}</p>
      <details className="text-sm">
        <summary className="text-px-muted focus-visible:outline-px-paper inline-flex min-h-11 cursor-pointer items-center focus-visible:outline-2 focus-visible:outline-offset-2">
          Show the numbers behind the chart
        </summary>
        {arrivals.length > 0 ? (
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left tabular-nums">
              <caption className="sr-only">
                People let in, for every five minutes
              </caption>
              <thead>
                <tr className="text-px-muted">
                  <th className="py-1 pr-3 font-medium" scope="col">
                    Starting at
                  </th>
                  <th className="py-1 font-medium" scope="col">
                    People let in
                  </th>
                </tr>
              </thead>
              <tbody>
                {arrivals.map((bucket) => (
                  <tr key={bucket.starts_at}>
                    <td className="py-1 pr-3">{timeOf(bucket.starts_at)}</td>
                    <td className="py-1">{count(bucket.admitted)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-px-muted pb-2">Nothing to list yet.</p>
        )}
      </details>
    </section>
  );
}
