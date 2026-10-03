"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import { useEffect, useId, useMemo, useState } from "react";
import { Flag } from "@/components/flag";
import { partyColor, partyFillIsDark } from "@/data/parties";
import {
  decodeMap,
  encodeMap,
  PARTIES,
  RATING_ORDER,
  ratingFromResult,
  ratingParty,
  ratingsFor,
  tally,
  type UserRating,
} from "@/data/ratings";
import type { ConstituencyCode } from "@/data/types";

export interface PredictionSeat {
  /** Named 2026 candidates, by party, as published. */
  candidates: { name: string; party: string }[];
  code: ConstituencyCode;
  /** SVG path for the constituency, in map units. */
  d: string;
  dpmStands: boolean;
  /** Each past election's winner and margin, by year (1990 on). */
  history: Record<string, { margin: number; winner: string }>;
  href: string;
  leanLabel: string;
  /** The model's rating at its default settings. */
  model: UserRating;
  name: string;
  notes: Record<string, string>;
  /** 2022 result, e.g. "NDC by 4.0 pts". */
  result2022: string;
  short: string;
  sitting: string;
}

interface Props {
  inset: { x0: number; x1: number; y0: number; y1: number };
  land: string;
  seats: PredictionSeat[];
}

type PredictionMap = Record<ConstituencyCode, UserRating>;
const HASH = /^#map=([a-j]{15})$/;

/** Fill for a rating: full party colour for Solid, lighter for Likely, tint for Lean. */
export function ratingStyle(rating: UserRating): React.CSSProperties {
  const party = ratingParty(rating);
  if (!party)
    return { background: "var(--el-paper-2)", color: "var(--el-ink)" };
  const strength = rating.split(" ")[0];
  if (strength === "Solid")
    return {
      background: partyColor(party),
      color: partyFillIsDark(party) ? "var(--el-paper)" : "var(--el-ink)",
    };
  if (strength === "Likely")
    return {
      background: `color-mix(in oklab, ${partyColor(party)} 55%, var(--el-paper))`,
      color: "var(--el-ink)",
    };
  return { background: partyColor(party, "tint"), color: "var(--el-ink)" };
}

function ratingFill(rating: UserRating): string {
  return String(ratingStyle(rating).background);
}

/**
 * Make your own prediction: rate each constituency from Solid NDC to Solid
 * NNP (and DPM where it stands), watch the tally, and share the map by link.
 */
export function PredictionTool({ seats, land, inset }: Props) {
  const codes = useMemo(() => seats.map((s) => s.code), [seats]);
  const dpmSeats = useMemo(
    () => new Set(seats.filter((s) => s.dpmStands).map((s) => s.code)),
    [seats]
  );
  const from = (pick: (s: PredictionSeat) => UserRating) =>
    Object.fromEntries(seats.map((s) => [s.code, pick(s)])) as PredictionMap;

  // Start from the most recent election; readers change what they disagree with.
  const fromResult = (year: string) =>
    from((s) => {
      const r = s.history[year];
      return r ? ratingFromResult(r.winner, r.margin) : "Toss-up";
    });
  const [map, setMap] = useState<PredictionMap>(() => fromResult("2022"));
  const [selected, setSelected] = useState<ConstituencyCode | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const pickerId = useId();

  useEffect(() => {
    const match = HASH.exec(window.location.hash);
    const shared = match?.[1] ? decodeMap(codes, match[1], dpmSeats) : null;
    if (shared) setMap(shared);
  }, [codes, dpmSeats]);

  function update(next: PredictionMap) {
    setMap(next);
    try {
      history.replaceState(null, "", `#map=${encodeMap(codes, next)}`);
    } catch {
      // Some embedded views refuse history changes; the map still works.
    }
  }

  /** Select a constituency; on narrow screens, bring the rating picker into view. */
  function select(code: ConstituencyCode) {
    setSelected(code);
    if (window.innerWidth >= 1024) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    requestAnimationFrame(() =>
      document.getElementById(pickerId)?.scrollIntoView({
        block: "start",
        behavior: reduce ? "auto" : "smooth",
      })
    );
  }

  const years = [...new Set(seats.flatMap((s) => Object.keys(s.history)))]
    .sort()
    .reverse();
  const t = tally(map);
  const seat = seats.find((s) => s.code === selected) ?? null;
  const ordered = [...seats].sort(
    (a, b) =>
      RATING_ORDER.indexOf(map[a.code]) - RATING_ORDER.indexOf(map[b.code])
  );

  let verdict: string;
  if (t.majority) verdict = `The ${t.majority} wins a majority on your map.`;
  else if (t.tossUps)
    verdict = `No one has eight seats yet. Your ${t.tossUps} toss-up${t.tossUps === 1 ? "" : "s"} decide${t.tossUps === 1 ? "s" : ""} it.`;
  else verdict = "No party reaches eight: a hung House on your map.";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-md border border-el-rule-2 px-3 py-1.5 text-base hover:bg-el-paper-2"
          onClick={() => update(from(() => "Toss-up"))}
          type="button"
        >
          All toss-ups
        </button>
        <label className="flex items-center gap-2 text-base">
          <span className="sr-only sm:not-sr-only">Start from an election</span>
          <select
            aria-label="Start from an election"
            className="min-h-11 rounded-md border border-el-rule-2 bg-background px-2"
            onChange={(e) => {
              const year = e.target.value;
              if (!year) return;
              update(fromResult(year));
              e.target.value = "";
            }}
            value=""
          >
            <option value="">Start from an election…</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y} result
              </option>
            ))}
          </select>
        </label>
        <button
          className="rounded-md bg-el-ink px-3 py-1.5 font-semibold text-base text-el-paper hover:opacity-90"
          onClick={async () => {
            const url = new URL(window.location.href);
            url.hash = `map=${encodeMap(codes, map)}`;
            update(map);
            try {
              await navigator.clipboard.writeText(url.href);
              setCopied("Link copied");
            } catch {
              setCopied("Copy the address bar");
            }
            setTimeout(() => setCopied(null), 1800);
          }}
          type="button"
        >
          {copied ?? "Copy link to your map"}
        </button>
      </div>

      <section
        aria-label="Your tally"
        className="border-el-ink border-t-2 pt-3"
      >
        <div
          aria-live="polite"
          className="flex flex-wrap items-baseline gap-x-6 gap-y-1"
        >
          {PARTIES.map((p) =>
            p === "DPM" && dpmSeats.size === 0 ? null : (
              <span
                className="font-bold font-serif text-2xl tabular-nums"
                key={p}
                style={{ color: partyColor(p, "ink") }}
              >
                {p} {t.seats[p]}
              </span>
            )
          )}
          <span className="font-bold font-serif text-2xl text-el-muted tabular-nums">
            Toss-up {t.tossUps}
          </span>
          <span className="text-el-ink-2">{verdict}</span>
        </div>
        <fieldset
          aria-label={RATING_ORDER.map((r) => `${r} ${t.byRating[r]}`).join(
            ", "
          )}
          className="relative mt-3 flex h-8 gap-px"
        >
          {ordered.map((s) => (
            <button
              aria-label={`${s.name}: ${map[s.code]}`}
              className={cn(
                "flex-1 font-bold text-sm",
                selected === s.code &&
                  "outline-2 outline-el-ink outline-offset-1"
              )}
              key={s.code}
              onClick={() => select(s.code)}
              style={ratingStyle(map[s.code])}
              title={`${s.name}: ${map[s.code]}`}
              type="button"
            >
              {s.code}
            </button>
          ))}
          <span
            aria-hidden="true"
            className="absolute -inset-y-1.5 w-0.5 bg-el-ink"
            style={{ left: `calc(${(8 / 15) * 100}% - 1px)` }}
          />
        </fieldset>
        <p className="mt-1 text-base text-el-muted leading-relaxed">
          Eight seats is a majority. Lean, Likely and Solid all count towards a
          party’s seats.
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-base sm:grid-cols-3 lg:grid-cols-5">
          {RATING_ORDER.filter(
            (r) => !r.endsWith("DPM") || dpmSeats.size > 0
          ).map((r) => (
            <li className="flex items-center gap-2" key={r}>
              <i
                className="inline-block size-3 rounded-[2px] border border-el-rule"
                style={{ background: ratingFill(r) }}
              />
              {r}{" "}
              <span className="text-el-muted tabular-nums">
                ({t.byRating[r]})
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <figure>
          <svg className="h-auto w-full" viewBox="-15.5 -25.5 43 41.5">
            <title>Your map. Select a constituency to rate it.</title>
            <path d={land} fill="var(--el-land)" />
            {seats.map((s) => (
              // An SVG link is the focusable, semantic control inside a map;
              // it jumps to the rating picker as well as selecting the seat.
              <a
                aria-label={`${s.name}: ${map[s.code]}. Select to rate.`}
                className="cursor-pointer outline-none hover:opacity-85 focus-visible:opacity-85"
                href={`#${pickerId}`}
                key={s.code}
                onClick={(e) => {
                  e.preventDefault();
                  select(s.code);
                }}
              >
                <path
                  className={
                    selected === s.code
                      ? "stroke-(--el-ink) [stroke-width:0.25]"
                      : "stroke-(--el-paper) [stroke-width:0.06]"
                  }
                  d={s.d}
                  fill={ratingFill(map[s.code])}
                >
                  <title>{`${s.name}: ${map[s.code]}`}</title>
                </path>
              </a>
            ))}
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
          <figcaption className="text-base text-el-muted">
            Select a constituency on the map, the bar or the list to rate it.
            Boundaries are illustrative.
          </figcaption>
        </figure>

        <div
          aria-live="polite"
          className="scroll-mt-20 border border-el-rule p-4"
          id={pickerId}
        >
          {seat ? (
            <>
              <p className="font-semibold text-el-muted text-sm uppercase leading-relaxed tracking-[0.07em]">
                Constituency {seat.code}
              </p>
              <h3 className="font-bold text-xl">
                <a className="hover:underline" href={seat.href}>
                  {seat.name}
                </a>
              </h3>
              <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-base">
                <dt className="text-el-muted">2022</dt>
                <dd>{seat.result2022}</dd>
                <dt className="text-el-muted">Member at dissolution</dt>
                <dd>{seat.sitting}</dd>
                <dt className="text-el-muted">Lean</dt>
                <dd>{seat.leanLabel}</dd>
                <dt className="text-el-muted">Model rating</dt>
                <dd>{seat.model}</dd>
                <dt className="text-el-muted">Named for 2026</dt>
                <dd>
                  {seat.candidates.length
                    ? seat.candidates.map((c, index) => (
                        <span key={c.party}>
                          {index > 0 && ", "}
                          {c.name} ({c.party})
                          {seat.notes[c.party] && (
                            <Flag
                              note={seat.notes[c.party]}
                              status="unverified"
                            />
                          )}
                        </span>
                      ))
                    : "None named yet"}{" "}
                  <a
                    className="underline underline-offset-2"
                    href={`${seat.href}#standing-title`}
                  >
                    Sources
                  </a>
                </dd>
              </dl>
              <fieldset className="mt-4">
                <legend className="font-semibold text-base">Your rating</legend>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {ratingsFor(seat.dpmStands).map((r) => (
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-base has-focus-visible:outline-2 has-focus-visible:outline-el-focus",
                        map[seat.code] === r
                          ? "border-2 border-el-ink font-semibold"
                          : "border-el-rule"
                      )}
                      key={r}
                    >
                      <input
                        checked={map[seat.code] === r}
                        className="sr-only"
                        name={`rating-${seat.code}`}
                        onChange={() => update({ ...map, [seat.code]: r })}
                        type="radio"
                        value={r}
                      />
                      <i
                        className="inline-block size-3.5 shrink-0 rounded-[2px] border border-el-rule"
                        style={{ background: ratingFill(r) }}
                      />
                      {r}
                    </label>
                  ))}
                </div>
                {!seat.dpmStands && (
                  <p className="mt-2 text-base text-el-muted leading-relaxed">
                    The DPM has not named a candidate here, so DPM ratings
                    aren’t offered.
                  </p>
                )}
              </fieldset>
            </>
          ) : (
            <p className="text-el-ink-2 leading-relaxed">
              Select a constituency to rate it. Each starts from its 2022
              result; change any you disagree with.
            </p>
          )}
        </div>
      </div>

      <section aria-label="Every constituency">
        <h3 className="font-semibold text-el-muted text-sm uppercase tracking-[0.07em]">
          Every constituency
        </h3>
        <ul className="mt-2 divide-y divide-el-rule border-el-rule border-y">
          {seats.map((s) => (
            <li
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
              key={s.code}
            >
              <span
                className="grid size-7 shrink-0 place-items-center rounded-[2px] font-bold text-base"
                style={ratingStyle(map[s.code])}
              >
                {s.code}
              </span>
              <button
                className="min-w-0 flex-1 text-left font-semibold hover:underline"
                onClick={() => select(s.code)}
                type="button"
              >
                {s.name}
                <span className="block font-normal text-base text-el-muted">
                  2022: {s.result2022} · lean {s.leanLabel}
                </span>
              </button>
              <label className="sr-only" htmlFor={`sel-${s.code}`}>
                Your rating for {s.name}
              </label>
              <select
                className="min-h-11 rounded-md border border-el-rule-2 bg-background px-2 text-base"
                id={`sel-${s.code}`}
                onChange={(e) =>
                  update({ ...map, [s.code]: e.target.value as UserRating })
                }
                value={map[s.code]}
              >
                {ratingsFor(s.dpmStands).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
