import Link from "next/link";
import { ChartViewport } from "@/components/chart-viewport";
import { PartyDot } from "@/components/party-chip";
import { eventSlug } from "@/data/events";
import { EVENTS, MAJORITY, nationalResult, SEATS } from "@/data/model";
import { partyColor, partyInfo } from "@/data/parties";
import type { ResultsFile } from "@/data/types";

const COL = 44;
const SQ = 18;
const GAP = 3;
const TOP = 8;
const LABEL = 22;

/**
 * Seats won at every general election mapped on today's 15 constituencies
 * (1972 onwards): one column of squares per election, coloured by the
 * winning party, with the majority line at eight. A legend names every
 * party shown (beside the chart on wide screens, below it on phones), and a table repeats the figures for screen readers.
 */
export function SeatHistory({ results }: { results: ResultsFile }) {
  const elections = EVENTS.filter((e) => e.kind === "general" && e.map).map(
    (e) => {
      const { seats } = nationalResult(results, e.id);
      const order = Object.entries(seats).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
      );
      return { id: e.id, year: e.year, order };
    }
  );
  const parties = [
    ...new Set(elections.flatMap((e) => e.order.map(([p]) => p))),
  ];
  const W = elections.length * COL;
  const stack = SEATS * (SQ + GAP);
  const H = TOP + stack + LABEL + 6;
  const majorityY = TOP + (SEATS - MAJORITY) * (SQ + GAP) - GAP / 2;

  return (
    <figure className="m-0 lg:grid lg:grid-cols-[minmax(0,auto)_minmax(14rem,1fr)] lg:items-end lg:gap-10">
      <div className="min-w-0">
        <ChartViewport>
          <svg
            aria-hidden="true"
            className="block h-auto w-full"
            style={{
              minWidth: `${W / 16}rem`,
              maxWidth: `${(W * 1.4) / 16}rem`,
            }}
            viewBox={`0 0 ${W} ${H}`}
          >
            <line
              stroke="var(--el-ink)"
              strokeDasharray="4 3"
              x1={0}
              x2={W}
              y1={majorityY}
              y2={majorityY}
            />
            {elections.map((e, col) => {
              let filled = 0;
              const x = col * COL + (COL - SQ) / 2;
              return (
                <g key={e.id}>
                  {e.order.flatMap(([party, n]) =>
                    Array.from({ length: n }, () => {
                      const y = TOP + (SEATS - 1 - filled) * (SQ + GAP);
                      filled += 1;
                      return (
                        <rect
                          fill={partyColor(party)}
                          height={SQ}
                          key={`${party}${filled}`}
                          rx={2}
                          width={SQ}
                          x={x}
                          y={y}
                        />
                      );
                    })
                  )}
                  <text
                    className="fill-(--el-ink-2) font-semibold text-[14px] tabular-nums"
                    textAnchor="middle"
                    x={col * COL + COL / 2}
                    y={TOP + stack + 16}
                  >
                    {e.year}
                  </text>
                </g>
              );
            })}
          </svg>
        </ChartViewport>
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-base text-el-ink-2 lg:mt-0 lg:mb-10 lg:flex-col lg:gap-y-2 lg:border-el-rule lg:border-l lg:pl-6">
        {parties.map((p) => (
          <span key={p}>
            <PartyDot party={p} />
            {partyInfo(p).name}
          </span>
        ))}
        <span>
          <span
            aria-hidden="true"
            className="mr-1.5 inline-block w-5 border-el-ink border-t border-dashed align-middle"
          />
          {MAJORITY} seats for a majority
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>Seats won at each general election since 1972</caption>
        <thead>
          <tr>
            <th scope="col">Election</th>
            <th scope="col">Seats won</th>
          </tr>
        </thead>
        <tbody>
          {elections.map((e) => (
            <tr key={e.id}>
              <th scope="row">
                <Link href={`/elections/${eventSlug(e.id)}`}>{e.year}</Link>
              </th>
              <td>
                {e.order
                  .map(([p, n]) => `${partyInfo(p).name} ${n}`)
                  .join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
