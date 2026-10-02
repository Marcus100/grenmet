"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag } from "@/components/flag";
import {
  countingOrder,
  type ReplayInputs,
  replayEstimate,
} from "@/data/outlook";
import { partyColor, partyFillIsDark } from "@/data/parties";
import { fmt, pct } from "@/lib/format";

interface Props {
  /** Division id → SVG path, for the map. */
  divisionPaths: Record<string, string>;
  inputs: ReplayInputs;
  inset: { x0: number; x1: number; y0: number; y1: number };
  land: string;
  /** Constituency code → name. */
  names: Record<string, string>;
}

const BUTTON =
  "rounded-md border border-el-rule-2 px-3 py-1.5 text-sm hover:bg-el-paper-2 aria-pressed:bg-el-ink aria-pressed:text-el-paper";

function arc(p0: number, p1: number, r: number, ri: number) {
  const cx = 170;
  const cy = 160;
  const a0 = Math.PI * (1 - p0);
  const a1 = Math.PI * (1 - p1);
  const pt = (a: number, rr: number) =>
    `${cx + rr * Math.cos(a)},${cy - rr * Math.sin(a)}`;
  return `M${pt(a0, r)} A${r},${r} 0 0 1 ${pt(a1, r)} L${pt(a1, ri)} A${ri},${ri} 0 0 0 ${pt(a0, ri)} Z`;
}

const BANDS: [number, number, string][] = [
  [0, 0.1, partyColor("NNP")],
  [0.1, 0.35, `color-mix(in oklab, ${partyColor("NNP")} 45%, var(--el-paper))`],
  [0.35, 0.65, "var(--el-paper-2)"],
  [0.65, 0.9, `color-mix(in oklab, ${partyColor("NDC")} 45%, var(--el-paper))`],
  [0.9, 1, partyColor("NDC")],
];

function liveText(done: boolean, p: number): string {
  if (!done) return `NDC majority: ${Math.round(p * 100)}% chance`;
  return p > 0.5 ? "NDC majority" : "NNP majority";
}

/**
 * Replay the 2022 count one polling division at a time. After each, the
 * estimate compares it with how the division voted in 2018, works out the
 * swing, projects the divisions still to come and simulates the result.
 */
export function Replay({ inputs, divisionPaths, land, inset, names }: Props) {
  const [seed, setSeed] = useState(2022);
  const [counted, setCounted] = useState(0);
  const [playing, setPlaying] = useState(false);
  const order = useMemo(
    () =>
      countingOrder(
        inputs.divisions.map((d) => d.division),
        seed
      ),
    [inputs, seed]
  );
  const reported = useMemo(
    () => new Set(order.slice(0, counted)),
    [order, counted]
  );
  const estimate = useMemo(
    () => replayEstimate(inputs, reported),
    [inputs, reported]
  );
  const byId = useMemo(
    () => Object.fromEntries(inputs.divisions.map((d) => [d.division, d])),
    [inputs]
  );
  const total = order.length;

  useEffect(() => {
    if (!playing) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const timer = setInterval(
      () =>
        setCounted((k) => {
          if (k + 1 >= total) setPlaying(false);
          return Math.min(total, k + 1);
        }),
      reduce ? 900 : 350
    );
    return () => clearInterval(timer);
  }, [playing, total]);

  const doneVotes = inputs.divisions
    .filter((d) => reported.has(d.division))
    .reduce((a, d) => a + d.ndc + d.nnp, 0);
  const allVotes = inputs.divisions.reduce((a, d) => a + d.ndc + d.nnp, 0);
  const swing = estimate.swing * 100;
  const latest = counted ? byId[order[counted - 1] ?? ""] : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <button
          aria-pressed={playing}
          className={BUTTON}
          onClick={() => {
            if (!playing && counted >= total) setCounted(0);
            setPlaying((p) => !p);
          }}
          type="button"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          className={BUTTON}
          onClick={() => {
            setPlaying(false);
            setCounted((k) => Math.min(total, k + 1));
          }}
          type="button"
        >
          Next division
        </button>
        <button
          className={BUTTON}
          onClick={() => {
            setPlaying(false);
            setCounted(total);
          }}
          type="button"
        >
          Skip to end
        </button>
        <button
          className={BUTTON}
          onClick={() => {
            setPlaying(false);
            setCounted(0);
          }}
          type="button"
        >
          Reset
        </button>
        <button
          className={BUTTON}
          onClick={() => {
            setPlaying(false);
            setSeed((s) => s + 1);
            setCounted(0);
          }}
          type="button"
        >
          New counting order
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <svg
            aria-labelledby="replay-live"
            className="mx-auto block h-auto w-full max-w-sm"
            role="img"
            viewBox="0 0 340 200"
          >
            {BANDS.map(([a, b, colour]) => (
              <path d={arc(a, b, 140, 110)} fill={colour} key={a} />
            ))}
            <text
              className="fill-(--el-nnp-ink) font-semibold text-[12px]"
              x={18}
              y={182}
            >
              NNP majority
            </text>
            <text
              className="fill-(--el-ndc-ink) font-semibold text-[12px]"
              textAnchor="end"
              x={322}
              y={182}
            >
              NDC majority
            </text>
            <g
              className="transition-transform duration-500 motion-reduce:transition-none"
              style={{
                transform: `rotate(${estimate.ndcMajority * 180}deg)`,
                transformOrigin: "170px 160px",
              }}
            >
              <line
                stroke="var(--el-ink)"
                strokeLinecap="round"
                strokeWidth={3}
                x1={170}
                x2={36}
                y1={160}
                y2={160}
              />
            </g>
            <circle cx={170} cy={160} fill="var(--el-ink)" r={7} />
            <text
              className="fill-(--el-ink) font-bold font-serif text-[20px]"
              id="replay-live"
              textAnchor="middle"
              x={170}
              y={120}
            >
              {liveText(counted === total, estimate.ndcMajority)}
            </text>
          </svg>
          <dl aria-live="polite" className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <dt className="font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]">
                Reported
              </dt>
              <dd className="font-semibold text-lg tabular-nums">
                {counted} of {total}
              </dd>
              <dd className="text-el-muted text-xs">
                {pct(doneVotes / allVotes, 0)} of the NDC–NNP vote
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]">
                Swing since 2018
              </dt>
              <dd className="font-semibold text-lg tabular-nums">
                {swing >= 0 ? "+" : "−"}
                {Math.abs(swing).toFixed(1)}
              </dd>
              <dd className="text-el-muted text-xs">
                points toward the {swing >= 0 ? "NDC" : "NNP"}, ±
                {(estimate.swingSd * 100).toFixed(1)}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]">
                Projected NDC seats
              </dt>
              <dd className="font-semibold text-lg tabular-nums">
                {estimate.median}
              </dd>
              <dd className="text-el-muted text-xs">
                80% range {estimate.lo}–{estimate.hi}
              </dd>
            </div>
          </dl>
          <div className="mt-4 grid grid-cols-15 gap-[3px]">
            {Object.entries(estimate.seatChance).map(([code, p]) => {
              const lead = p >= 0.5 ? "NDC" : "NNP";
              const strength = Math.abs(p - 0.5) * 2;
              const called = strength >= 0.98;
              return (
                <span
                  className={`grid aspect-square place-items-center rounded-[2px] font-bold text-[11px] ${called ? "outline-2 outline-el-ink outline-offset-1" : ""}`}
                  key={code}
                  style={{
                    background: `color-mix(in oklab, ${partyColor(lead)} ${Math.round(15 + 85 * strength)}%, var(--el-paper-2))`,
                    color:
                      strength > 0.6 && partyFillIsDark(lead)
                        ? "#fff"
                        : "var(--el-ink)",
                  }}
                  title={`${names[code]}: NDC ${Math.round(p * 100)}%${called ? " · called" : ""}`}
                >
                  {code}
                </span>
              );
            })}
          </div>
          <p className="mt-1 text-el-muted text-xs">
            Colour strength shows each seat’s projected chance. Outlined seats
            are called at 99%.
          </p>
        </div>
        <figure>
          <svg className="h-auto w-full" viewBox="-15.5 -25.5 43 41.5">
            <title>Polling divisions counted so far, coloured by who led</title>
            <path d={land} fill="var(--el-land)" />
            {Object.entries(divisionPaths).map(([id, d]) => {
              const div = byId[id];
              const done = div && reported.has(id);
              return (
                <path
                  className="stroke-(--el-paper) [stroke-width:0.05]"
                  d={d}
                  fill={
                    done
                      ? partyColor(div.ndc >= div.nnp ? "NDC" : "NNP")
                      : "var(--el-land)"
                  }
                  key={id}
                >
                  <title>
                    {div
                      ? `${id} · ${div.place}: ${done ? `NDC ${fmt(div.ndc)}, NNP ${fmt(div.nnp)}` : "not yet reported"}`
                      : id}
                  </title>
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
          <figcaption aria-live="polite" className="mt-2 text-el-ink-2 text-sm">
            {latest
              ? `Latest: ${latest.division} ${latest.place} (${names[latest.code]}): NDC ${fmt(latest.ndc)}, NNP ${fmt(latest.nnp)}.`
              : "No divisions counted yet. Before any count, the estimate starts from the 2018 result, when the NNP won all 15 seats, with the full range of possible national swings."}
          </figcaption>
        </figure>
      </div>
      <p className="text-el-muted text-xs">
        The counting order is simulated
        <Flag
          note="The real 2022 order in which divisions reported has not been published."
          status="unverified"
        />
        . Results are the official 2022 division totals.
      </p>
    </div>
  );
}
