import type { PrintixEventSummary } from "@barrelsgd/api-client";
import type { Link } from "@/lib/use-live-count";

const number = new Intl.NumberFormat();

interface CountBarProps {
  readonly link: Link;
  readonly summary: PrintixEventSummary | null;
}

/** Tickets in against tickets issued, with the gates' own counts behind a disclosure. */
export function CountBar({ summary, link }: CountBarProps) {
  if (!summary) {
    return (
      <p className="text-px-muted text-sm" role="status">
        {link === "no-signal"
          ? "No signal: the count cannot be loaded."
          : "Loading the count…"}
      </p>
    );
  }
  const issued = summary.issued;
  const inCount = summary.admitted;
  const percent =
    issued > 0 ? Math.min(100, Math.round((inCount / issued) * 100)) : 0;
  const valueText = `${number.format(inCount)} of ${number.format(issued)} in`;

  return (
    <section aria-label="Live count" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-3xl font-semibold tabular-nums">
          {number.format(inCount)}
          <span className="text-px-muted text-base font-medium"> in</span>
        </p>
        <p className="text-px-muted text-sm tabular-nums">
          of {number.format(issued)} issued
        </p>
      </div>
      <div
        aria-label="Tickets in against tickets issued"
        aria-valuemax={issued}
        aria-valuemin={0}
        aria-valuenow={inCount}
        aria-valuetext={valueText}
        className="bg-px-rule h-2 w-full overflow-hidden rounded-full"
        role="progressbar"
      >
        <div
          className="bg-px-green h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-px-muted text-sm tabular-nums">
        Not yet in: {number.format(summary.not_yet_in)}
        {link === "no-signal" ? " · no signal, so this may be out of date" : ""}
      </p>
      <details className="text-sm">
        <summary className="text-px-muted focus-visible:outline-px-paper inline-flex min-h-11 cursor-pointer items-center focus-visible:outline-2 focus-visible:outline-offset-2">
          By gate
        </summary>
        {summary.admitted_by_gate.length > 0 ? (
          <ul className="flex flex-col gap-1 pb-2">
            {summary.admitted_by_gate.map((gate) => (
              <li className="flex justify-between gap-3" key={gate.gate}>
                <span className="truncate">{gate.gate}</span>
                <span className="tabular-nums">
                  {number.format(gate.admitted)} in
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-px-muted pb-2">No one admitted yet.</p>
        )}
      </details>
    </section>
  );
}
