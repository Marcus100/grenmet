"use client";

import { useState } from "react";
import { partyColor, partyFillIsDark } from "@/data/parties";
import {
  governmentAt,
  type SwingSeat,
  seatsAt,
  swingToFlip,
  tippingPoint,
  winnerAt,
} from "@/data/swing";

export interface SwingYear {
  seats: SwingSeat[];
  year: string;
}

interface Props {
  inset: { x0: number; x1: number; y0: number; y1: number };
  land: string;
  /** Constituency name and SVG path by code. */
  shapes: Record<string, { d: string; name: string }>;
  years: SwingYear[];
}

const describe = (g: string) =>
  g === "hung" ? "a hung House" : `an ${g} majority`;

/** Move votes between the NDC and the NNP uniformly and see which seats change hands. */
export function SwingCalculator({ years, shapes, land, inset }: Props) {
  const [year, setYear] = useState(years.at(-1)?.year ?? "2022");
  const [swing, setSwing] = useState(0);
  const data = years.find((y) => y.year === year) ?? years[0];
  if (!data) return null;
  const { seats } = data;
  const tally = Object.entries(seatsAt(seats, swing)).sort(
    (a, b) => b[1] - a[1]
  );
  const lead = tally[0];
  const flips = seats.filter((s) => winnerAt(s, swing) !== winnerAt(s, 0));
  const tp = tippingPoint(seats);
  const ladder = [...seats].sort((a, b) => swingToFlip(a) - swingToFlip(b));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Election
          <select
            className="h-9 rounded-md border border-el-rule-2 bg-background px-2"
            onChange={(e) => {
              setYear(e.target.value);
              setSwing(0);
            }}
            value={year}
          >
            {[...years].reverse().map((y) => (
              <option key={y.year} value={y.year}>
                {y.year}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm">
          {swing === 0
            ? "Swing: none (actual result)"
            : `Swing: ${Math.abs(swing).toFixed(1)} points toward the ${swing > 0 ? "NDC" : "NNP"}`}
          <input
            className="accent-(--el-ink)"
            max={20}
            min={-20}
            onChange={(e) => setSwing(Number(e.target.value))}
            step={0.1}
            type="range"
            value={swing}
          />
          <span className="flex justify-between text-el-muted text-xs">
            <span>← Toward NNP 20 pts</span>
            <span>Toward NDC 20 pts →</span>
          </span>
        </label>
        <button
          className="rounded-md border border-el-rule-2 px-3 py-1.5 text-sm hover:bg-el-paper-2"
          onClick={() => setSwing(0)}
          type="button"
        >
          Actual result
        </button>
        {tp && (
          <button
            className="rounded-md border border-el-rule-2 px-3 py-1.5 text-sm hover:bg-el-paper-2"
            onClick={() => setSwing(tp.s)}
            type="button"
          >
            Jump to the tipping point
          </button>
        )}
      </div>

      <div aria-live="polite">
        <p className="font-bold font-serif text-2xl">
          {tally.map(([p, n], i) => (
            <span key={p} style={{ color: partyColor(p, "ink") }}>
              {i > 0 && <span className="text-el-muted"> · </span>}
              {p} {n}
            </span>
          ))}
          <span className="ml-3 font-normal font-sans text-el-ink-2 text-sm">
            {lead && lead[1] >= 8
              ? `${lead[0]} majority`
              : "No party has a majority (8 needed)"}
          </span>
        </p>
        <p className="mt-1 max-w-[70ch] text-el-ink-2 text-sm">
          {tp
            ? `In ${year}, a uniform swing of ${Math.abs(tp.s).toFixed(1)} points toward the ${tp.s > 0 ? "NDC" : "NNP"} would have changed the outcome from ${describe(tp.from)} to ${describe(tp.to)}.`
            : `In ${year}, no swing of up to 30 points changes who governs.`}
          {swing !== 0 &&
            ` At this swing, ${flips.length ? `${flips.length} seat${flips.length > 1 ? "s change" : " changes"} hands: ${flips.map((s) => shapes[s.code]?.name).join(", ")}` : "no seats change hands"}.`}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <figure>
          <svg className="h-auto w-full" viewBox="-15.5 -25.5 43 41.5">
            <title>{`Projected winner in each constituency, ${year}, at this swing`}</title>
            <path d={land} fill="var(--el-land)" />
            {seats.map((s) => {
              const w = winnerAt(s, swing);
              const changed = w !== winnerAt(s, 0);
              return (
                <path
                  className={
                    changed
                      ? "stroke-(--el-ink) [stroke-width:0.3]"
                      : "stroke-(--el-paper) [stroke-width:0.06]"
                  }
                  d={shapes[s.code]?.d}
                  fill={partyColor(w)}
                  key={s.code}
                >
                  <title>{`${shapes[s.code]?.name}: ${w}${changed ? ` (actual ${winnerAt(s, 0)})` : ""}. Changes hands at ${Math.abs(swingToFlip(s)).toFixed(1)} pts toward the ${swingToFlip(s) > 0 ? "NDC" : "NNP"}`}</title>
                </path>
              );
            })}
            <rect
              fill="none"
              height={inset.y1 - inset.y0}
              stroke="var(--el-rule-2)"
              strokeDasharray=".5 .35"
              strokeWidth={0.08}
              width={inset.x1 - inset.x0}
              x={inset.x0}
              y={-inset.y1}
            />
          </svg>
          <figcaption className="text-el-muted text-xs">
            Seats that change hands are outlined. Boundaries are illustrative.
          </figcaption>
        </figure>
        <div>
          <h3 className="font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]">
            Tipping-point ladder
          </h3>
          <p className="text-el-muted text-xs">
            The swing each seat needs to change hands between the NDC and the
            NNP, from most secure NNP to most secure NDC. The rule under the
            eighth seat is where a majority is decided.
          </p>
          <ol className="mt-2">
            {ladder.map((s, i) => {
              const need = swingToFlip(s);
              const w = winnerAt(s, swing);
              return (
                <li
                  className={`flex items-center gap-2 py-1 text-sm ${i === 7 ? "border-el-ink border-b-2" : ""}`}
                  key={s.code}
                >
                  <span
                    className="grid size-6 shrink-0 place-items-center rounded-[2px] font-bold text-[11px]"
                    style={{
                      background: partyColor(w),
                      color: partyFillIsDark(w) ? "#fff" : "#121314",
                    }}
                  >
                    {s.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {shapes[s.code]?.name}
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    {Number.isFinite(need)
                      ? `${Math.abs(need).toFixed(1)} to ${need > 0 ? "NDC" : "NNP"}`
                      : "–"}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-el-muted text-xs">
            At this swing: {describe(governmentAt(seats, swing))}.
          </p>
        </div>
      </div>
    </div>
  );
}
