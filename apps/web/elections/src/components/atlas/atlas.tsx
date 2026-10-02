"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ringPath } from "@/components/map/flat-map";
import type {
  AtlasContest,
  AtlasData,
  AtlasDivision,
  AtlasEvent,
} from "@/data/atlas";
import {
  type Encoded,
  encode,
  hexToRgb,
  type MapMode,
  modeAvailable,
  modeLegend,
  PALETTE_KEYS,
  type Palette,
  type Rgb,
  rgbCss,
} from "@/data/atlas-encode";
import { eventTitle, sideLabel } from "@/data/events";
import { CODES, contestStats, slugify } from "@/data/model";
import { partyColor, partyFillIsDark, partyInfo } from "@/data/parties";
import type { ConstituencyCode, Ring, Verification } from "@/data/types";
import { fmt, pct } from "@/lib/format";

type View = "flat" | "tiles";
interface MapRegion {
  height: number;
  key: string;
  rgb: Rgb;
  rings: Ring[];
  selected?: boolean;
}
const MODES: [MapMode, string][] = [
  ["winner", "Winner"],
  ["margin", "Margin"],
  ["turnout", "Turnout"],
  ["share", "NDC vs NNP"],
  ["swing", "Swing"],
];
/** Tile cartogram positions: [column, row]. */
const TILES: Record<ConstituencyCode, [number, number]> = {
  A: [4, 0],
  R: [2, 1],
  P: [3, 1],
  N: [1, 2],
  E: [2, 2],
  D: [3, 2],
  M: [1, 3],
  H: [2, 3],
  C: [3, 3],
  J: [0, 4],
  G: [1, 4],
  F: [2, 4],
  B: [3, 4],
  L: [0, 5],
  K: [1, 5],
};
const ALL = { x0: -15, x1: 27, y0: -15.5, y1: 25 };
const LABEL =
  "font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]";
const MARK: Partial<Record<Verification, string>> = {
  unverified: "✱",
  check: "✱✱",
  corroborated: "†",
};

function bboxOf(rings: Ring[]) {
  const b = {
    x0: Number.POSITIVE_INFINITY,
    y0: Number.POSITIVE_INFINITY,
    x1: Number.NEGATIVE_INFINITY,
    y1: Number.NEGATIVE_INFINITY,
  };
  for (const r of rings)
    for (const [x, y] of r) {
      b.x0 = Math.min(b.x0, x);
      b.x1 = Math.max(b.x1, x);
      b.y0 = Math.min(b.y0, y);
      b.y1 = Math.max(b.y1, y);
    }
  return b;
}

function readPalette(el: HTMLElement): Palette {
  const style = getComputedStyle(el);
  return Object.fromEntries(
    PALETTE_KEYS.map((k) => [
      k,
      hexToRgb(style.getPropertyValue(`--el-${k}`) || "#cccccc"),
    ])
  );
}

function modeLabel(mode: MapMode, text: string, referendum: boolean): string {
  if (!referendum) return text;
  if (mode === "share") return "Yes vs No";
  if (mode === "winner") return "Result";
  return text;
}

function activate(run: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      run();
    }
  };
}

interface UrlState {
  division: string | null;
  eventId: string;
  mode: MapMode;
  seat: ConstituencyCode | null;
  view: View;
}

function readUrl(): Partial<UrlState> {
  const q = new URLSearchParams(window.location.search);
  const out: Partial<UrlState> = {};
  const e = q.get("e");
  if (e) out.eventId = e;
  const c = q.get("c")?.toUpperCase();
  if (c && (CODES as readonly string[]).includes(c))
    out.seat = c as ConstituencyCode;
  const d = q.get("d");
  if (d) out.division = d.toUpperCase();
  const m = q.get("mode");
  if (m && MODES.some(([k]) => k === m)) out.mode = m as MapMode;
  const v = q.get("view");
  if (v === "flat" || v === "tiles") out.view = v;
  return out;
}

function writeUrl(s: UrlState) {
  const q = new URLSearchParams();
  q.set("e", s.eventId);
  if (s.seat) q.set("c", s.seat.toLowerCase());
  if (s.division) q.set("d", s.division.toLowerCase());
  if (s.mode !== "winner") q.set("mode", s.mode);
  if (s.view !== "flat") q.set("view", s.view);
  try {
    history.replaceState(null, "", `?${q.toString()}`);
  } catch {
    // Embedded views can refuse history changes.
  }
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  disabled?: (v: T) => boolean;
}) {
  return (
    <fieldset
      aria-label={label}
      className="inline-flex flex-wrap gap-0.5 rounded-md border border-el-rule-2 p-0.5"
    >
      {options.map(([v, text]) => (
        <button
          aria-pressed={value === v}
          className="whitespace-nowrap rounded px-2.5 py-1 text-[13px] text-el-ink-2 disabled:text-el-rule-2 aria-pressed:bg-el-ink aria-pressed:text-el-paper"
          disabled={disabled?.(v)}
          key={v}
          onClick={() => onChange(v)}
          type="button"
        >
          {text}
        </button>
      ))}
    </fieldset>
  );
}

function EventHeader({ event }: { event: AtlasEvent }) {
  const referendum = event.kind === "ref";
  const national = event.national;
  const seats = Object.entries(national.seats).sort((a, b) => b[1] - a[1]);
  const votes = Object.entries(national.votes).sort((a, b) => b[1] - a[1]);
  const totals = referendum ? votes : seats;
  const total = referendum ? national.total : national.races;
  const majority = Math.floor(national.races / 2) + 1;
  return (
    <section aria-label="National result">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold text-2xl">{eventTitle(event.id)}</h2>
        <p className="text-el-muted text-sm">
          {event.date} · Turnout {pct(national.turnout)}
        </p>
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-4">
        {totals.map(([party, count]) => (
          <div className="min-w-24 flex-1" key={party}>
            <dt className="font-semibold text-sm">{sideLabel(party)}</dt>
            <dd
              className="mt-1 font-bold text-5xl tabular-nums"
              style={{ color: partyColor(party, "ink") }}
            >
              {referendum ? pct(count / (total || 1)) : count}
              {!referendum && (
                <span className="ml-2 font-normal text-el-muted text-sm">
                  seats
                </span>
              )}
            </dd>
            <dd className="mt-1 text-el-muted text-sm tabular-nums">
              {fmt(national.votes[party] ?? 0)} votes
              {!referendum &&
                ` · ${pct((national.votes[party] ?? 0) / (national.total || 1))}`}
            </dd>
          </div>
        ))}
      </dl>
      <div className="relative mt-4">
        <div
          aria-label={totals
            .map(
              ([party, count]) =>
                `${sideLabel(party)} ${referendum ? pct(count / (total || 1)) : `${count} seats`}`
            )
            .join(", ")}
          className="flex h-4 gap-px"
          role="img"
        >
          {totals.map(([party, count]) => (
            <span
              key={party}
              style={{
                width: `${(count / (total || 1)) * 100}%`,
                background: partyColor(party),
              }}
            />
          ))}
        </div>
        {!referendum && (
          <span
            aria-hidden="true"
            className="absolute -inset-y-1 w-0.5 bg-el-ink"
            style={{ left: `${(majority / national.races) * 100}%` }}
          />
        )}
      </div>
      {!referendum && (
        <p className="mt-2 text-el-muted text-xs">
          {majority} seats needed for a majority · {national.races}{" "}
          constituencies
        </p>
      )}
      <p className="mt-2 text-el-muted text-xs">
        {!event.official && (
          <b className="mr-1 text-el-ink-2">
            Includes secondary-source figures.
          </b>
        )}
        Source: {event.source}.
        {national.turnoutNote && <> {national.turnoutNote}.</>}
      </p>
    </section>
  );
}

function HistoricalResults({ event }: { event: AtlasEvent }) {
  return (
    <section
      aria-label="Historical constituency results"
      className="mt-6 border-el-ink border-t-2 pt-4"
    >
      <h3 className="font-bold text-xl">Results by constituency</h3>
      <p className="mt-2 max-w-prose text-el-ink-2 text-sm">
        This election used {event.national.races} constituencies with different
        boundaries from today’s 15. Results are listed under their historical
        names. ✱ marks unverified figures; ✱✱ marks a source conflict.
      </p>
      <div className="mt-4 grid gap-px border border-el-rule bg-el-rule md:grid-cols-2 xl:grid-cols-3">
        {event.historicalResults.map((contest) => (
          <article className="bg-background p-4" key={contest.name}>
            <h4 className="font-bold font-serif text-lg">{contest.name}</h4>
            <ContestRows contest={contest} referendum={false} />
            {contest.note && (
              <p className="mt-3 text-el-ink-2 text-xs">{contest.note}</p>
            )}
            {contest.gazette && (
              <p className="mt-2 text-el-muted text-xs">
                Winner’s votes: {contest.gazette}.
              </p>
            )}
          </article>
        ))}
      </div>
      <Link
        className="mt-4 inline-block text-sm underline underline-offset-2"
        href={`/elections/${event.id}`}
      >
        Full election record and sources →
      </Link>
    </section>
  );
}

function Legend({ event, mode }: { event: AtlasEvent; mode: MapMode }) {
  const legend = modeLegend(mode, event.kind === "ref", event.prev);
  const order = Object.entries(event.national.seats).sort(
    (a, b) => b[1] - a[1]
  );
  return (
    <div className="absolute top-3 left-3 max-w-64 rounded-md bg-background/90 p-2.5 text-xs shadow-sm">
      <p className={LABEL}>
        {legend.title} · {event.label}
      </p>
      {mode === "winner" ? (
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {order.map(([p]) => (
            <span key={p}>
              <i
                className="mr-1 inline-block size-2.5 rounded-[2px]"
                style={{ background: partyColor(p) }}
              />
              {sideLabel(p)}
            </span>
          ))}
        </p>
      ) : (
        <p className="mt-1.5 flex justify-between text-el-muted">
          <span>{legend.ends[0]}</span>
          <span>{legend.ends[1]}</span>
        </p>
      )}
    </div>
  );
}

function FlatView({
  land,
  landRings,
  regions,
  bounds,
  label,
  onPick,
  names,
}: {
  land: Rgb;
  landRings: Ring[];
  regions: MapRegion[];
  label: string;
  bounds: typeof ALL;
  onPick: (k: string) => void;
  names: AtlasData["names"];
}) {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox={`${bounds.x0 - 1} ${-bounds.y1 - 1} ${bounds.x1 - bounds.x0 + 2} ${bounds.y1 - bounds.y0 + 2}`}
    >
      <title>{label}</title>
      <path d={ringPath(landRings)} fill={rgbCss(land)} />
      {regions.map((r) => (
        // biome-ignore lint/a11y/useSemanticElements: an SVG path can't be a <button>; it is keyboard-operable.
        <path
          aria-label={
            r.key.length === 1
              ? names[r.key as ConstituencyCode][0]
              : `Polling division ${r.key}`
          }
          className={cn(
            "cursor-pointer outline-none focus-visible:opacity-80",
            r.selected
              ? "stroke-(--el-ink) [stroke-width:0.25]"
              : "stroke-(--el-paper) [stroke-width:0.06]"
          )}
          d={ringPath(r.rings)}
          fill={rgbCss(r.rgb)}
          key={r.key}
          onClick={() => onPick(r.key)}
          onKeyDown={activate(() => onPick(r.key))}
          role="button"
          tabIndex={0}
        >
          <title>
            {r.key.length === 1
              ? names[r.key as ConstituencyCode][0]
              : `Polling division ${r.key}`}
          </title>
        </path>
      ))}
    </svg>
  );
}

function TilesView({
  event,
  encoded,
  land,
  mode,
  names,
  onPick,
}: {
  event: AtlasEvent;
  encoded: Record<string, Encoded>;
  land: Rgb;
  mode: MapMode;
  names: AtlasData["names"];
  onPick: (c: ConstituencyCode) => void;
}) {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="-0.5 -0.5 5.5 6.5">
      <title>{`${event.label} tile map, one square per constituency`}</title>
      {CODES.map((c) => {
        const [x, y] = TILES[c];
        const e = encoded[c] ?? { rgb: land, height: 0 };
        const w = event.results[c]?.c[0]?.[1];
        const light = w && partyFillIsDark(w) && mode === "winner";
        return (
          // biome-ignore lint/a11y/useSemanticElements: an SVG group can't be a <button>; it is keyboard-operable.
          <g
            aria-label={names[c][0]}
            className="cursor-pointer outline-none"
            key={c}
            onClick={() => onPick(c)}
            onKeyDown={activate(() => onPick(c))}
            role="button"
            tabIndex={0}
          >
            <rect
              fill={rgbCss(e.rgb)}
              height={0.92}
              rx={0.06}
              width={0.92}
              x={x}
              y={y}
            />
            <text
              className="font-bold text-[0.3px]"
              fill={light ? "#fff" : "#121314"}
              textAnchor="middle"
              x={x + 0.46}
              y={y + 0.56}
            >
              {c}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ContestRows({
  contest,
  referendum,
}: {
  contest: AtlasContest;
  referendum: boolean;
}) {
  const valid = contest.c.reduce((a, r) => a + r[2], 0) || 1;
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {contest.c.map((row, i) => (
        <li key={`${row[0]}${row[1]}`}>
          <span className="flex justify-between gap-2">
            <span className={i === 0 ? "font-semibold" : ""}>
              {row[0]}
              {!referendum && (
                <span className="text-el-muted text-xs"> · {row[1]}</span>
              )}
              {row[3] && MARK[row[3]] && (
                <sup
                  className="text-el-muted"
                  title="See Sources for what this mark means"
                >
                  {MARK[row[3]]}
                </sup>
              )}
            </span>
            <span className="tabular-nums">
              <b>{pct(row[2] / valid)}</b>{" "}
              <span className="text-el-muted text-xs">{fmt(row[2])}</span>
            </span>
          </span>
          <span className="mt-0.5 block h-1.5 bg-el-paper-2">
            <span
              className="block h-full"
              style={{
                width: `${(row[2] / valid) * 100}%`,
                background: partyColor(row[1]),
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

function DivisionList({
  divisions,
  selected,
  onSelect,
  referendum,
}: {
  divisions: AtlasDivision[];
  selected: string | null;
  onSelect: (d: string | null) => void;
  referendum: boolean;
}) {
  return (
    <>
      <h4 className={`${LABEL} mt-5`}>{divisions.length} polling divisions</h4>
      <ul className="mt-1 divide-y divide-el-rule text-sm">
        {divisions.map((d) => {
          const valid = d.c.reduce((a, r) => a + r[2], 0) || 1;
          const [w, r] = d.c;
          return (
            <li key={d.division}>
              <button
                aria-pressed={selected === d.division}
                className="flex w-full items-center gap-2 py-1.5 text-left aria-pressed:font-semibold"
                onClick={() =>
                  onSelect(d.division === selected ? null : d.division)
                }
                type="button"
              >
                <span className="w-9 shrink-0 tabular-nums">{d.division}</span>
                <span className="min-w-0 flex-1 truncate">
                  {d.place || "—"}
                </span>
                <span className="shrink-0 tabular-nums">
                  {w
                    ? `${sideLabel(w[1])} +${(((w[2] - (r?.[2] ?? 0)) / valid) * 100).toFixed(0)}`
                    : "–"}
                </span>
              </button>
              {selected === d.division && (
                <p className="pb-2 text-el-muted text-xs tabular-nums">
                  {d.c
                    .map(
                      (x) =>
                        `${sideLabel(x[1])} ${fmt(x[2])} (${pct(x[2] / valid)})`
                    )
                    .join(" · ")}{" "}
                  · {fmt(d.cast)} {referendum ? "voters" : "ballots"} · turnout{" "}
                  {d.reg ? pct(d.cast / d.reg) : "–"}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ConstituencyPanel({
  event,
  seat,
  names,
  division,
  onDivision,
  onBack,
}: {
  event: AtlasEvent;
  seat: ConstituencyCode;
  names: AtlasData["names"];
  division: string | null;
  onDivision: (d: string | null) => void;
  onBack: () => void;
}) {
  const ref = event.kind === "ref";
  const contest = event.results[seat] ?? null;
  const divisions = event.divisions.filter((d) => d.code === seat);
  return (
    <div>
      <button
        className="mb-2 text-sm underline underline-offset-2"
        onClick={onBack}
        type="button"
      >
        ← All constituencies
      </button>
      <p className={LABEL}>
        Constituency {seat} · {event.label}
      </p>
      <h3 className="font-bold text-2xl">
        <Link
          className="hover:underline"
          href={`/constituencies/${slugify(names[seat][0])}`}
        >
          {names[seat][0]}
        </Link>
      </h3>
      {contest ? (
        <>
          <ContestRows contest={contest} referendum={ref} />
          <p className="mt-2 text-el-muted text-xs tabular-nums">
            Turnout{" "}
            {contest.reg && contest.cast
              ? pct(contest.cast / contest.reg)
              : "–"}{" "}
            · Registered {fmt(contest.reg)}
          </p>
          {contest.note && (
            <p className="mt-2 text-el-ink-2 text-xs">
              <b>Note:</b> {contest.note}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-el-ink-2 text-sm">
          No readable result for this constituency: the official copy is
          damaged.
        </p>
      )}
      {divisions.length > 0 && (
        <DivisionList
          divisions={divisions}
          onSelect={onDivision}
          referendum={ref}
          selected={division}
        />
      )}
    </div>
  );
}

function NationalPanel({
  event,
  names,
  onSelect,
}: {
  event: AtlasEvent;
  names: AtlasData["names"];
  onSelect: (c: ConstituencyCode) => void;
}) {
  const ref = event.kind === "ref";
  const rows = CODES.flatMap((c) => {
    const r = event.results[c];
    return r ? [{ c, s: contestStats(r) }] : [];
  });
  return (
    <div>
      <p className={LABEL}>{event.label} · All of Grenada</p>
      <h3 className="font-bold text-xl">Results by constituency</h3>
      <p className="mt-1 text-el-ink-2 text-sm">
        Select a constituency on the map or below.
        {event.divisions.length
          ? " You can go down to each polling division."
          : " Polling-division results exist from 2013."}
      </p>
      {event.missing.length > 0 && (
        <p className="mt-2 text-el-ink-2 text-xs">
          No readable result for{" "}
          {event.missing.map((c) => names[c][0]).join(", ")}.
        </p>
      )}
      <ul className="mt-3 divide-y divide-el-rule">
        {rows.map(({ c, s }) => (
          <li key={c}>
            <button
              className="flex w-full items-center gap-2.5 py-2 text-left hover:bg-el-paper-2"
              onClick={() => onSelect(c)}
              type="button"
            >
              <span
                className="grid size-7 shrink-0 place-items-center rounded-[2px] font-bold text-xs"
                style={{
                  background: partyColor(s.winner[1]),
                  color: partyFillIsDark(s.winner[1]) ? "#fff" : "#121314",
                }}
              >
                {c}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-sm">
                  {names[c][0]}
                </span>
                <span className="block truncate text-el-muted text-xs">
                  {ref
                    ? `${sideLabel(s.winner[1])} ahead`
                    : `${s.winner[0]}, ${partyInfo(s.winner[1]).name}`}
                </span>
              </span>
              <span className="shrink-0 text-sm tabular-nums">
                +{(s.margin * 100).toFixed(1)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Timeline({
  events,
  current,
  onChange,
}: {
  events: AtlasEvent[];
  current: string;
  onChange: (id: string) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const currentIndex = events.findIndex((event) => event.id === current);
  const previous = events[currentIndex - 1];
  const next = events[currentIndex + 1];
  useEffect(() => {
    const container = track.current;
    const selected = container?.querySelector<HTMLButtonElement>(
      `[data-event="${current}"]`
    );
    if (container && selected) {
      container.scrollLeft =
        selected.offsetLeft -
        (container.clientWidth - selected.clientWidth) / 2;
    }
  }, [current]);
  return (
    <nav
      aria-label="Election or referendum"
      className="mb-6 border-el-rule border-y py-3"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className={LABEL}>Choose an election</span>
        <div className="flex gap-2">
          <button
            aria-label="Previous election or referendum"
            className="min-h-11 rounded-md border border-el-rule-2 px-3 text-sm hover:bg-el-paper-2 disabled:opacity-40"
            disabled={!previous}
            onClick={() => previous && onChange(previous.id)}
            type="button"
          >
            ← Previous
          </button>
          <button
            aria-label="Next election or referendum"
            className="min-h-11 rounded-md border border-el-rule-2 px-3 text-sm hover:bg-el-paper-2 disabled:opacity-40"
            disabled={!next}
            onClick={() => next && onChange(next.id)}
            type="button"
          >
            Next →
          </button>
        </div>
      </div>
      <div className="relative flex gap-1 overflow-x-auto" ref={track}>
        {events.map((e) => {
          const lead =
            Object.entries(e.national.seats).sort(
              (a, b) => b[1] - a[1]
            )[0]?.[0] ?? "";
          return (
            <button
              aria-label={
                e.kind === "ref" ? `${e.year} referendum` : String(e.year)
              }
              aria-pressed={e.id === current}
              className="flex min-h-14 min-w-14 shrink-0 flex-col items-center rounded-md px-2 py-1.5 text-sm hover:bg-el-paper-2 focus-visible:outline-2 focus-visible:outline-el-focus aria-pressed:bg-el-ink aria-pressed:text-el-paper"
              data-event={e.id}
              key={e.id}
              onClick={() => onChange(e.id)}
              type="button"
            >
              <span
                className={cn("tabular-nums", e.kind === "ref" && "italic")}
              >
                {e.year}
              </span>
              {e.kind === "ref" && (
                <small className="font-semibold text-[9px] uppercase tracking-[0.04em] opacity-80">
                  Ref.
                </small>
              )}
              <span
                className="mt-1 block h-1 w-8 rounded-full"
                style={{ background: partyColor(lead) }}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Regions to draw: constituencies, or the selected one's polling divisions, dimming the rest. */
function mapRegions(
  data: AtlasData,
  encoded: Record<string, Encoded>,
  land: Rgb,
  seat: ConstituencyCode | null,
  division: string | null,
  showDivisions: boolean
): MapRegion[] {
  const dim = (e: Encoded): Encoded => ({
    rgb: [
      land[0] * 0.72 + e.rgb[0] * 0.28,
      land[1] * 0.72 + e.rgb[1] * 0.28,
      land[2] * 0.72 + e.rgb[2] * 0.28,
    ],
    height: 0.12,
  });
  const out: MapRegion[] = [];
  for (const code of CODES) {
    if (showDivisions && code === seat) continue;
    let e = encoded[code] ?? { rgb: land, height: 0.08 };
    if (seat && code !== seat) e = dim(e);
    out.push({
      key: code,
      rings: data.geo.constituencies[code].rings,
      rgb: e.rgb,
      height: e.height,
      selected: code === seat,
    });
  }
  if (showDivisions)
    for (const [key, shape] of Object.entries(data.geo.divisions)) {
      if (shape.cons !== seat) continue;
      const e = encoded[key] ?? { rgb: land, height: 0.06 };
      out.push({
        key,
        rings: shape.rings,
        rgb: e.rgb,
        height: e.height,
        selected: key === division,
      });
    }
  return out;
}

function useEncoded(
  event: AtlasEvent | undefined,
  previous: AtlasEvent | null,
  palette: Palette | null,
  mode: MapMode
): Record<string, Encoded> {
  return useMemo(() => {
    const out: Record<string, Encoded> = {};
    if (!(event && palette)) return out;
    const ref = event.kind === "ref";
    for (const code of CODES)
      out[code] = encode(
        palette,
        event.results[code] ?? null,
        previous?.results[code] ?? null,
        mode,
        ref,
        "cons"
      );
    const prevDivs = Object.fromEntries(
      (previous?.divisions ?? []).map((d) => [d.division, d])
    );
    for (const d of event.divisions) {
      const before = prevDivs[d.division];
      out[d.division] = encode(
        palette,
        { c: d.c, cast: d.cast, reg: d.reg },
        before ? { c: before.c, cast: null, reg: null } : null,
        mode,
        ref,
        "div"
      );
    }
    return out;
  }, [event, previous, palette, mode]);
}

/** Every vote since 1951, retaining historical constituency names before 1972. */
export function Atlas() {
  const [data, setData] = useState<AtlasData | null>(null);
  const [failed, setFailed] = useState(false);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [state, setState] = useState<UrlState>({
    eventId: "2022",
    mode: "winner",
    view: "flat",
    seat: null,
    division: null,
  });
  const set = (patch: Partial<UrlState>) =>
    setState((s) => ({ ...s, ...patch }));

  useEffect(() => {
    fetch("/atlas-data.json")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<AtlasData>;
      })
      .then(setData)
      .catch(() => setFailed(true));
    setPalette(readPalette(document.documentElement));
    setState((s) => ({ ...s, ...readUrl() }));
  }, []);

  useEffect(() => {
    if (data) writeUrl(state);
  }, [data, state]);

  const event =
    data?.events.find((e) => e.id === state.eventId) ?? data?.events.at(-1);
  const previous = data?.events.find((e) => e.id === event?.prev) ?? null;
  const mode: MapMode =
    event && modeAvailable(event, state.mode) ? state.mode : "winner";
  const encoded = useEncoded(event, previous, palette, mode);

  if (failed)
    return (
      <p className="border-el-rule border-y py-6 text-el-ink-2">
        The map data couldn’t be loaded. Reload the page to try again.
      </p>
    );
  if (!(data && event && palette))
    return (
      <p className="border-el-rule border-y py-6 text-el-muted">
        Loading the atlas…
      </p>
    );

  const { seat, division, view } = state;
  const chooseEvent = (eventId: string) =>
    set({
      eventId,
      seat: data.events.find((item) => item.id === eventId)?.mapped
        ? seat
        : null,
      division: null,
    });
  if (!event.mapped) {
    return (
      <div>
        <Timeline
          current={event.id}
          events={data.events}
          onChange={chooseEvent}
        />
        <EventHeader event={event} />
        <HistoricalResults event={event} />
      </div>
    );
  }
  const land = palette.land ?? [0.8, 0.8, 0.8];
  const showDivisions = Boolean(
    view !== "tiles" && seat && event.divisions.length > 0
  );
  const regions = mapRegions(
    data,
    encoded,
    land,
    seat,
    division,
    showDivisions
  );
  const pick = (key: string | null) => {
    if (!key) set(division ? { division: null } : { seat: null });
    else if ((CODES as readonly string[]).includes(key))
      set({ seat: key as ConstituencyCode, division: null });
    else set({ division: key });
  };

  return (
    <div>
      <Timeline
        current={event.id}
        events={data.events}
        onChange={chooseEvent}
      />
      <EventHeader event={event} />
      <div className="mt-4 border-el-ink border-t-2">
        <div className="flex flex-wrap items-center gap-3 border-el-rule border-b py-3">
          <div className="max-w-full">
            <Segmented
              disabled={(m) => !modeAvailable(event, m)}
              label="Map shows"
              onChange={(m: MapMode) => set({ mode: m })}
              options={MODES.map(([k, t]): [MapMode, string] => [
                k,
                modeLabel(k, t, event.kind === "ref"),
              ])}
              value={mode}
            />
          </div>
          <Segmented
            label="View"
            onChange={(v: View) =>
              set(
                v === "tiles"
                  ? { view: v, seat: null, division: null }
                  : { view: v }
              )
            }
            options={[
              ["flat", "Map"],
              ["tiles", event.kind === "ref" ? "Constituencies" : "Seats"],
            ]}
            value={view}
          />
          {seat && (
            <button
              className="ml-auto rounded-md border border-el-rule-2 px-2.5 py-1 text-[13px] hover:bg-el-paper-2"
              onClick={() => set({ seat: null, division: null })}
              type="button"
            >
              ← All of Grenada
            </button>
          )}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="relative h-112 overflow-hidden bg-el-sea sm:h-144 lg:h-176">
            {view === "flat" && (
              <FlatView
                bounds={
                  seat ? bboxOf(data.geo.constituencies[seat].rings) : ALL
                }
                label={`${event.label} map`}
                land={land}
                landRings={data.geo.land}
                names={data.names}
                onPick={pick}
                regions={regions}
              />
            )}
            {view === "tiles" && (
              <TilesView
                encoded={encoded}
                event={event}
                land={land}
                mode={mode}
                names={data.names}
                onPick={(c) => set({ view: "flat", seat: c, division: null })}
              />
            )}
            <Legend event={event} mode={mode} />
            <p className="absolute bottom-2 left-3 max-w-[calc(100%-24px)] rounded-[3px] bg-el-sea/80 px-1.5 text-[11px] text-el-muted">
              Boundaries are illustrative. Carriacou and Petite Martinique are
              drawn closer than they are.
            </p>
          </div>
          <aside
            aria-label="Results"
            aria-live="polite"
            className="border-el-rule px-0 py-4 lg:max-h-176 lg:overflow-auto lg:border-l lg:px-4"
          >
            {seat ? (
              <ConstituencyPanel
                division={division}
                event={event}
                names={data.names}
                onBack={() => set({ seat: null, division: null })}
                onDivision={(d) => set({ division: d })}
                seat={seat}
              />
            ) : (
              <NationalPanel
                event={event}
                names={data.names}
                onSelect={(c) => set({ seat: c, division: null })}
              />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
