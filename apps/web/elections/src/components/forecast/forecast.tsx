"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import { useMemo, useState } from "react";
import { ChartViewport } from "@/components/chart-viewport";
import { Flag } from "@/components/flag";
import { leanLabel } from "@/data/model";
import {
  leader,
  type ModelInputs,
  type ModelSettings,
  percentile,
  RATING_COLUMNS,
  type Rating,
  rate,
  seatChances,
  simulateThreeWay,
} from "@/data/outlook";
import { partyColor, partyFillIsDark } from "@/data/parties";
import type { ConstituencyCode } from "@/data/types";
import { leanFill } from "@/lib/colors";

export interface ForecastSeat {
  code: ConstituencyCode;
  dpmCandidate?: string;
  href: string;
  lean: number;
  short: string;
}

interface Props {
  df: number;
  inputs: ModelInputs;
  seats: ForecastSeat[];
  sL: number;
  sN: number;
}

const LABEL = "font-semibold text-sm text-el-muted uppercase tracking-[0.07em]";

function columnStyle(rating: Rating): React.CSSProperties {
  if (rating === "Toss-up")
    return { background: "var(--el-paper-2)", color: "var(--el-ink)" };
  const party = rating.endsWith("NDC") ? "NDC" : "NNP";
  const band = rating.split(" ")[0];
  if (band === "Safe")
    return {
      background: partyColor(party),
      color: partyFillIsDark(party) ? "#fff" : "#121314",
    };
  if (band === "Likely")
    return {
      background: `color-mix(in oklab, ${partyColor(party)} 55%, var(--el-paper))`,
      color: "var(--el-ink)",
    };
  return { background: partyColor(party, "tint"), color: "var(--el-ink)" };
}

function chanceText(c: { NDC: number; NNP: number; DPM: number }): string {
  return `NDC ${Math.round(c.NDC * 100)}% · NNP ${Math.round(c.NNP * 100)}%${c.DPM >= 0.005 ? ` · DPM ${Math.round(c.DPM * 100)}%` : ""}`;
}

function Slider({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
  ends,
}: {
  id: string;
  label: React.ReactNode;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  ends: [string, string];
}) {
  return (
    <div>
      <label className="block font-semibold text-base" htmlFor={id}>
        {label}
      </label>
      <input
        className="mt-1 w-full accent-(--el-ink)"
        id={id}
        max={max}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <div className="flex justify-between text-base text-el-muted">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  );
}

/**
 * The interactive part of the Forecast: model settings drive the seat ratings
 * and 10,000 seeded simulated elections. Everything recomputes in the browser
 * from the official-results inputs passed in.
 */
export function Forecast({ seats, inputs, sN, sL, df }: Props) {
  const [settings, setSettings] = useState<ModelSettings>(inputs.defaults);
  const [volatility, setVolatility] = useState(1);
  const set = (patch: Partial<ModelSettings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  const lean = useMemo(
    () =>
      Object.fromEntries(seats.map((s) => [s.code, s.lean])) as Record<
        ConstituencyCode,
        number
      >,
    [seats]
  );
  const dpmSeats = useMemo(
    () =>
      Object.fromEntries(
        seats.filter((s) => s.dpmCandidate).map((s) => [s.code, s.dpmCandidate])
      ) as Partial<Record<ConstituencyCode, string>>,
    [seats]
  );

  const chances = useMemo(
    () => seatChances(lean, sL, settings, dpmSeats),
    [lean, sL, settings, dpmSeats]
  );
  const sim = useMemo(
    () =>
      simulateThreeWay(
        settings.national,
        sN * volatility,
        sL,
        lean,
        {
          seats: dpmSeats,
          share: settings.dpm,
          fromNnp: settings.fromNnp,
          personal: dpmSeats.G ? { G: settings.personal } : {},
        },
        10_000,
        7,
        df
      ),
    [settings, volatility, sN, sL, lean, dpmSeats, df]
  );

  const ratings = Object.fromEntries(
    seats.map((s) => [s.code, rate(chances[s.code])])
  ) as Record<ConstituencyCode, Rating>;
  const count = (side: string) =>
    seats.filter((s) => ratings[s.code].endsWith(side)).length;
  const tossUps = seats.filter((s) => ratings[s.code] === "Toss-up");
  const expected = (p: "NDC" | "NNP" | "DPM") =>
    seats.reduce((a, s) => a + chances[s.code][p], 0);

  const { presets, defaults } = inputs;
  let tag = "";
  if (Math.abs(settings.national - presets.result2022) < 0.0006)
    tag = " (the 2022 result)";
  else if (Math.abs(settings.national - presets.government) < 0.003)
    tag = " (usual swing against government)";
  const isDpb = Math.abs(settings.national - presets.dpb) < 0.003;

  const n = sim.n;
  const lo = percentile(sim.hist, n, 0.1);
  const hi = percentile(sim.hist, n, 0.9);
  const per100 = (v: number) => Math.round((v / n) * 100);
  const maxBar = Math.max(...sim.hist);
  const tipping = Object.entries(sim.tipping)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8) as [ConstituencyCode, number][];
  const byCode = Object.fromEntries(seats.map((s) => [s.code, s]));

  return (
    <div className="space-y-10">
      <fieldset className="border border-el-rule p-4 sm:p-5">
        <legend className={cn(LABEL, "px-1")}>
          Model settings · these drive the ratings and the range of outcomes
        </legend>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <Slider
              ends={["← NNP", "NDC →"]}
              id="st-n"
              label={
                <>
                  National NDC share of the NDC–NNP vote:{" "}
                  {(settings.national * 100).toFixed(1)}%{tag}
                  {isDpb && (
                    <>
                      {" "}
                      (DPB survey
                      <Flag
                        note="DPB Global published estimated party bases only; its full figures are under scrutiny."
                        status="check"
                      />
                      )
                    </>
                  )}
                </>
              }
              max={65}
              min={35}
              onChange={(v) => set({ national: v / 100 })}
              step={0.1}
              value={Number((settings.national * 100).toFixed(1))}
            />
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["2022 result", presets.result2022],
                  ["Usual swing against government", presets.government],
                  ["DPB survey ✱✱", presets.dpb],
                  ["Dead even", presets.even],
                ] as const
              ).map(([label, value]) => (
                <button
                  className="rounded-md border border-el-rule-2 px-2.5 py-1 text-base hover:bg-el-paper-2"
                  key={label}
                  onClick={() => set({ national: value })}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <Slider
              ends={["0%", "30%"]}
              id="st-d"
              label={
                <>
                  DPM share where it stands: {(settings.dpm * 100).toFixed(1)}%
                  {settings.dpm === defaults.dpm && (
                    <>
                      {" "}
                      (assumed
                      <Flag
                        note="No poll has measured DPM support. This is an assumption until one does."
                        status="unverified"
                      />
                      )
                    </>
                  )}
                </>
              }
              max={30}
              min={0}
              onChange={(v) => set({ dpm: v / 100 })}
              step={0.5}
              value={settings.dpm * 100}
            />
            <Slider
              ends={["All from the NDC", "All from the NNP"]}
              id="st-s"
              label={
                <>
                  DPM votes taken from the NNP:{" "}
                  {Math.round(settings.fromNnp * 100)}%, from the NDC:{" "}
                  {Math.round((1 - settings.fromNnp) * 100)}%
                  {settings.fromNnp === defaults.fromNnp && (
                    <>
                      {" "}
                      (assumed
                      <Flag
                        note="Where DPM votes come from is an assumption until a poll or result shows it."
                        status="unverified"
                      />
                      )
                    </>
                  )}
                </>
              }
              max={100}
              min={0}
              onChange={(v) => set({ fromNnp: v / 100 })}
              step={5}
              value={settings.fromNnp * 100}
            />
            <Slider
              ends={["0", "25 pts"]}
              id="st-pv"
              label={
                <>
                  Peter David’s personal vote in the Town, taken from the NNP:{" "}
                  {(settings.personal * 100).toFixed(1)} points
                  {settings.personal === defaults.personal &&
                    " (from 2008–2018 results)"}
                </>
              }
              max={25}
              min={0}
              onChange={(v) => set({ personal: v / 100 })}
              step={0.5}
              value={settings.personal * 100}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-base text-el-muted">
          <button
            className="rounded-md border border-el-rule-2 px-2.5 py-1 text-el-ink hover:bg-el-paper-2"
            onClick={() => setSettings(defaults)}
            type="button"
          >
            Reset to defaults
          </button>
          <span>
            In 5 of 7 elections the governing party lost ground, by{" "}
            {Math.abs(inputs.governmentSwing * 100).toFixed(1)} points on
            average, but building that in barely improved the backtest, so the
            default is the 2022 result.
          </span>
        </div>
      </fieldset>

      <section aria-labelledby="ratings-title">
        <h3 className="font-bold text-xl" id="ratings-title">
          Seat ratings
        </h3>
        <p
          aria-live="polite"
          className="mt-1 max-w-[70ch] text-base text-el-ink-2 leading-relaxed"
        >
          With these settings, <b>{count("NDC")}</b> seats lean or better to the
          NDC, <b>{count("NNP")}</b> to the NNP, and <b>{tossUps.length}</b>{" "}
          {tossUps.length === 1 ? "is a toss-up" : "are toss-ups"}
          {tossUps.length > 0 && ` (${tossUps.map((s) => s.short).join(", ")})`}
          . Expected seats: NDC {expected("NDC").toFixed(1)}, NNP{" "}
          {expected("NNP").toFixed(1)}
          {expected("DPM") >= 0.05 && `, DPM ${expected("DPM").toFixed(1)}`}.
        </p>
        <div className="mt-4 grid gap-px border border-el-rule bg-el-rule sm:grid-cols-4 lg:grid-cols-7">
          {RATING_COLUMNS.map((column) => {
            const inColumn = seats
              .filter((s) => ratings[s.code] === column)
              .sort((a, b) => chances[b.code].NDC - chances[a.code].NDC);
            return (
              <div className="bg-background p-2" key={column}>
                <h4 className={cn(LABEL, "flex justify-between")}>
                  <span>{column}</span>
                  <span className="tabular-nums">{inColumn.length}</span>
                </h4>
                <ul className="mt-2 space-y-1">
                  {inColumn.map((s) => {
                    const c = chances[s.code];
                    const top = leader(c);
                    return (
                      <li key={s.code}>
                        <a
                          className="block rounded-[2px] px-2 py-1.5 text-base leading-tight"
                          href={s.href}
                          style={columnStyle(column)}
                          title={`${s.short}: ${chanceText(c)}${s.dpmCandidate ? `. DPM candidate: ${s.dpmCandidate}` : ""}`}
                        >
                          <b>{s.code}</b> {s.short}
                          {s.dpmCandidate && <small> +DPM</small>}
                          <span className="block tabular-nums opacity-80">
                            {column === "Toss-up" ? `${top} ` : ""}
                            {Math.round(c[top] * 100)}%
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-base text-el-muted leading-relaxed">
          The percentage is the chance the seat goes to that column’s party,
          allowing a typical local deviation of ±{(sL * 100).toFixed(1)} points
          from the national swing, as in the three elections since 2008. Safe:
          95% or more. Likely: 80–95%. Lean: 60–80%. Toss-up: under 60% for the
          leader. +DPM marks the {Object.keys(dpmSeats).length} seats where the
          Democratic People’s Movement has a candidate.
        </p>
      </section>

      <section aria-labelledby="range-title">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-bold text-xl" id="range-title">
            The range of outcomes
          </h3>
          <fieldset
            aria-label="National swing"
            className="inline-flex rounded-md border border-el-rule-2 p-0.5"
          >
            {(
              [
                [1, "Historical swings"],
                [0.5, "Half as volatile"],
              ] as const
            ).map(([v, label]) => (
              <button
                aria-pressed={volatility === v}
                className="rounded px-2.5 py-1 text-base aria-pressed:bg-el-ink aria-pressed:text-el-paper"
                key={v}
                onClick={() => setVolatility(v)}
                type="button"
              >
                {label}
              </button>
            ))}
          </fieldset>
        </div>
        <p className="mt-1 max-w-[70ch] text-base text-el-ink-2 leading-relaxed">
          10,000 simulated elections. Each draws a national swing like those
          Grenada has seen (±{(sN * volatility * 100).toFixed(1)} points, with
          fat tails, since there have been only seven), then gives every seat
          its own local variation.
        </p>
        <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <figure>
            <ChartViewport>
              <svg
                aria-label="Distribution of NDC seats in simulated elections"
                className="h-auto w-full"
                role="img"
                style={{ minWidth: `${560 / 16}rem` }}
                viewBox="0 0 560 250"
              >
                {sim.hist.map((v, k) => {
                  const bw = (560 - 46) / 16;
                  const x = 36 + k * bw;
                  const h = (v / maxBar) * 206;
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: seat counts 0–15 are the index
                    <g key={k}>
                      <rect
                        fill={partyColor(k >= 8 ? "NDC" : "NNP")}
                        height={h}
                        rx={1.5}
                        width={bw - 4}
                        x={x + 2}
                        y={220 - h}
                      >
                        <title>{`NDC ${k} seats: ${v.toLocaleString("en-GB")} of 10,000 simulations`}</title>
                      </rect>
                      <text
                        className="fill-(--el-muted) text-[14px]"
                        textAnchor="middle"
                        x={x + bw / 2}
                        y={238}
                      >
                        {k}
                      </text>
                    </g>
                  );
                })}
                <line
                  stroke="var(--el-ink)"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  x1={36 + 8 * ((560 - 46) / 16)}
                  x2={36 + 8 * ((560 - 46) / 16)}
                  y1={8}
                  y2={224}
                />
                <text
                  className="fill-(--el-ink) font-semibold text-[14px]"
                  x={40 + 8 * ((560 - 46) / 16)}
                  y={16}
                >
                  Majority →
                </text>
              </svg>
            </ChartViewport>
            <figcaption className="text-base text-el-muted">
              NDC seats across 10,000 simulated elections. The NNP and DPM hold
              the rest. Eight seats is a majority.
            </figcaption>
          </figure>
          <div>
            <p
              aria-live="polite"
              className="font-serif text-el-ink-2 text-lg leading-normal"
            >
              In 8 of 10 simulations the NDC won between{" "}
              <b>
                {lo} and {hi} seats
              </b>
              . Out of every 100: NDC majority <b>{per100(sim.ndcMajority)}</b>,
              NNP majority <b>{per100(sim.nnpMajority)}</b>, no majority{" "}
              <b>{per100(sim.hung)}</b>. The DPM won at least one seat in{" "}
              <b>{per100(n - (sim.dpmSeats[0] ?? 0))}</b>.
            </p>
            <h4 className={cn(LABEL, "mt-5")}>Which seat decides it</h4>
            <p className="text-base text-el-muted leading-relaxed">
              The tipping-point seat gives the winner its eighth seat.
            </p>
            <ul className="mt-2 space-y-1.5 text-base">
              {tipping.map(([code, v]) => (
                <li className="flex items-center gap-2" key={code}>
                  <span className="w-36 shrink-0 truncate">
                    {code} · {byCode[code]?.short}
                  </span>
                  <span className="h-3 flex-1 bg-el-paper-2">
                    <span
                      className="block h-full"
                      style={{
                        width: `${(v / (tipping[0]?.[1] ?? 1)) * 100}%`,
                        background: leanFill((byCode[code]?.lean ?? 0) * 3),
                      }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right text-base tabular-nums">
                    {Math.round((v / n) * 100)}% ·{" "}
                    {leanLabel(byCode[code]?.lean ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
