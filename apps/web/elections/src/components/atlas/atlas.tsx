"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import type { SceneRegion } from "./scene-3d";

const Scene3D = dynamic(() => import("./scene-3d").then((m) => m.Scene3D), {
  ssr: false,
  loading: () => (
    <p className="p-6 text-el-muted text-sm">Loading the 3D map…</p>
  ),
});

type View = "3d" | "flat" | "tiles";
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
  if (v === "flat" || v === "tiles" || v === "3d") out.view = v;
  return out;
}

function writeUrl(s: UrlState) {
  const q = new URLSearchParams();
  q.set("e", s.eventId);
  if (s.seat) q.set("c", s.seat.toLowerCase());
  if (s.division) q.set("d", s.division.toLowerCase());
  if (s.mode !== "winner") q.set("mode", s.mode);
  if (s.view !== "3d") q.set("view", s.view);
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
      className="inline-flex shrink-0 gap-0.5 rounded-md border border-el-rule-2 p-0.5"
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
  const ref = event.kind === "ref";
  const n = event.national;
  const order = Object.entries(n.seats).sort((a, b) => b[1] - a[1]);
  const votes = Object.entries(n.votes).sort((a, b) => b[1] - a[1]);
  return (
    <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div>
        <p className="font-semibold text-el-ink-2 text-xs uppercase tracking-[0.08em]">
          {ref ? "Constitutional referendum" : "General election"} ·{" "}
          {event.date}
        </p>
        <h2 className="mt-1 font-bold text-3xl">
          {ref
            ? eventTitle(event.id)
            : order.map(([p, k]) => `${p} ${k}`).join(" · ")}
        </h2>
        <p className="mt-1 text-el-muted text-xs">
          {!event.official && (
            <b className="mr-1 text-el-ink-2">Not officially sourced.</b>
          )}
          Source: {event.source}.
        </p>
      </div>
      <div>
        <div
          aria-label={votes
            .map(([p, v]) => `${sideLabel(p)} ${pct(v / n.total)}`)
            .join(", ")}
          className="flex h-3.5 gap-0.5"
          role="img"
        >
          {votes
            .filter(([, v]) => v / n.total >= 0.01)
            .map(([p, v]) => (
              <span
                key={p}
                style={{
                  width: `${(v / n.total) * 100}%`,
                  background: partyColor(p),
                }}
              />
            ))}
        </div>
        <p className="mt-1.5 flex flex-wrap gap-x-4 text-[13px]">
          {votes.slice(0, 4).map(([p, v]) => (
            <span key={p}>
              <i
                className="mr-1.5 inline-block size-2.5 rounded-[2px] align-[-1px]"
                style={{ background: partyColor(p) }}
              />
              <b>{sideLabel(p)}</b> {pct(v / n.total)}
            </span>
          ))}
          <span className="text-el-muted">Turnout {pct(n.turnout)}</span>
        </p>
      </div>
    </div>
  );
}

function Legend({
  event,
  mode,
  view,
}: {
  event: AtlasEvent;
  mode: MapMode;
  view: View;
}) {
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
      {view === "3d" && (
        <p className="mt-1 text-el-muted">Height: {legend.height}</p>
      )}
    </div>
  );
}

function FlatView({
  land,
  landRings,
  regions,
  label,
  onPick,
  names,
}: {
  land: Rgb;
  landRings: Ring[];
  regions: SceneRegion[];
  label: string;
  onPick: (k: string) => void;
  names: AtlasData["names"];
}) {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="-15.5 -25.5 43 41.5"
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
        />
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
  return (
    <nav
      aria-label="Election or referendum"
      className="flex gap-1 overflow-x-auto border-el-rule border-t py-3"
    >
      {events.map((e) => {
        const lead =
          Object.entries(e.national.seats).sort(
            (a, b) => b[1] - a[1]
          )[0]?.[0] ?? "";
        return (
          <button
            aria-pressed={e.id === current}
            className="flex min-w-14 shrink-0 flex-col items-center rounded-md px-2 py-1.5 text-sm aria-pressed:bg-el-ink aria-pressed:text-el-paper"
            key={e.id}
            onClick={() => onChange(e.id)}
            type="button"
          >
            <span className={cn("tabular-nums", e.kind === "ref" && "italic")}>
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
    </nav>
  );
}

/** Regions to draw: constituencies, or the selected one's polling divisions, dimming the rest. */
function sceneRegions(
  data: AtlasData,
  encoded: Record<string, Encoded>,
  land: Rgb,
  seat: ConstituencyCode | null,
  division: string | null,
  showDivisions: boolean
): SceneRegion[] {
  const dim = (e: Encoded): Encoded => ({
    rgb: [
      land[0] * 0.72 + e.rgb[0] * 0.28,
      land[1] * 0.72 + e.rgb[1] * 0.28,
      land[2] * 0.72 + e.rgb[2] * 0.28,
    ],
    height: 0.12,
  });
  const out: SceneRegion[] = [];
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

/** The results atlas: every mapped vote since 1972, in 3D, flat or as tiles. */
export function Atlas() {
  const [data, setData] = useState<AtlasData | null>(null);
  const [failed, setFailed] = useState(false);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [state, setState] = useState<UrlState>({
    eventId: "2022",
    mode: "winner",
    view: "3d",
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
  const land = palette.land ?? [0.8, 0.8, 0.8];
  const showDivisions = Boolean(
    view !== "tiles" && seat && event.divisions.length > 0
  );
  const regions = sceneRegions(
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
      <EventHeader event={event} />
      <div className="mt-4 border-el-ink border-t-2">
        <div className="flex flex-wrap items-center gap-3 border-el-rule border-b py-3">
          <div className="max-w-full overflow-x-auto">
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
              ["3d", "3D"],
              ["flat", "Flat"],
              ["tiles", "Tiles"],
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
        <div className="grid lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="relative h-[min(70vh,640px)] min-h-[360px] overflow-hidden bg-el-sea">
            {view === "3d" && (
              <Scene3D
                bbox={seat ? bboxOf(data.geo.constituencies[seat].rings) : ALL}
                colours={{
                  sea: palette.sea ?? land,
                  land,
                  edge: palette["div-mid"] ?? land,
                }}
                inset={data.geo.inset}
                land={data.geo.land}
                onPick={pick}
                regions={regions}
              />
            )}
            {view === "flat" && (
              <FlatView
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
            <Legend event={event} mode={mode} view={view} />
            <p className="absolute bottom-2 left-3 max-w-[calc(100%-24px)] rounded-[3px] bg-el-sea/80 px-1.5 text-[11px] text-el-muted">
              Boundaries are illustrative. Carriacou and Petite Martinique are
              drawn closer than they are.
            </p>
          </div>
          <aside
            aria-label="Results"
            aria-live="polite"
            className="max-h-[min(70vh,640px)] overflow-auto border-el-rule p-4 lg:border-l"
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
        <Timeline
          current={event.id}
          events={data.events}
          onChange={(id) => set({ eventId: id, division: null })}
        />
      </div>
    </div>
  );
}
