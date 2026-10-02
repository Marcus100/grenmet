"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import { useEffect, useId, useMemo, useState } from "react";
import { partyColor, partyFillIsDark } from "@/data/parties";
import {
  decodeMap,
  encodeMap,
  PARTIES,
  RATING_ORDER,
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
  href: string;
  leanLabel: string;
  /** The model's rating at its default settings. */
  model: UserRating;
  name: string;
  /** 2022 result, e.g. "NDC by 4.0 pts". */
  result2022: string;
  short: string;
  sitting: string;
  won2022: "NDC" | "NNP";
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
      color: partyFillIsDark(party) ? "#fff" : "#121314",
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

  const [map, setMap] = useState<PredictionMap>(() => from((s) => s.model));
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
        {(
          [
            ["Start from the model", () => update(from((s) => s.model))],
            [
              "2022 result",
              () => update(from((s) => `Solid ${s.won2022}` as UserRating)),
            ],
            ["All toss-ups", () => update(from(() => "Toss-up"))],
          ] as const
        ).map(([label, run]) => (
          <button
            className="rounded-md border border-el-rule-2 px-3 py-1.5 text-sm hover:bg-el-paper-2"
            key={label}
            onClick={run}
            type="button"
          >
            {label}
          </button>
        ))}
        <button
          className="rounded-md bg-el-ink px-3 py-1.5 font-semibold text-el-paper text-sm hover:opacity-90"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
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
        <div
          aria-label={RATING_ORDER.map((r) => `${r} ${t.byRating[r]}`).join(
            ", "
          )}
          className="relative mt-3 flex h-8 gap-px"
          role="img"
        >
          {ordered.map((s) => (
            <button
              aria-label={`${s.name}: ${map[s.code]}`}
              className={cn(
                "flex-1 font-bold text-[11px]",
                selected === s.code &&
                  "outline-2 outline-el-ink outline-offset-1"
              )}
              key={s.code}
              onClick={() => setSelected(s.code)}
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
        </div>
        <p className="mt-1 text-el-muted text-xs">
          Eight seats is a majority. Lean, Likely and Solid all count towards a
          party’s seats.
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-5">
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
                  setSelected(s.code);
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
          <figcaption className="text-el-muted text-xs">
            Select a constituency on the map, the bar or the list to rate it.
            Boundaries are illustrative.
          </figcaption>
        </figure>

        <div
          aria-live="polite"
          className="border border-el-rule p-4"
          id={pickerId}
        >
          {seat ? (
            <>
              <p className="font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]">
                Constituency {seat.code}
              </p>
              <h3 className="font-bold text-xl">
                <a className="hover:underline" href={seat.href}>
                  {seat.name}
                </a>
              </h3>
              <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-el-muted">2022</dt>
                <dd>{seat.result2022}</dd>
                <dt className="text-el-muted">Sitting member</dt>
                <dd>{seat.sitting}</dd>
                <dt className="text-el-muted">Lean</dt>
                <dd>{seat.leanLabel}</dd>
                <dt className="text-el-muted">Model rating</dt>
                <dd>{seat.model}</dd>
                <dt className="text-el-muted">Named for 2026</dt>
                <dd>
                  {seat.candidates.length
                    ? seat.candidates
                        .map((c) => `${c.name} (${c.party})`)
                        .join(", ")
                    : "None named yet"}
                </dd>
              </dl>
              <fieldset className="mt-4">
                <legend className="font-semibold text-sm">Your rating</legend>
                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {ratingsFor(seat.dpmStands).map((r) => (
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm",
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
                  <p className="mt-2 text-el-muted text-xs">
                    The DPM has not named a candidate here, so DPM ratings
                    aren’t offered.
                  </p>
                )}
              </fieldset>
            </>
          ) : (
            <p className="text-el-ink-2">
              Select a constituency to rate it. Each starts at the model’s
              rating; change any you disagree with.
            </p>
          )}
        </div>
      </div>

      <section aria-label="Every constituency">
        <h3 className="font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]">
          Every constituency
        </h3>
        <ul className="mt-2 divide-y divide-el-rule border-el-rule border-y">
          {seats.map((s) => (
            <li
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
              key={s.code}
            >
              <span
                className="grid size-7 shrink-0 place-items-center rounded-[2px] font-bold text-xs"
                style={ratingStyle(map[s.code])}
              >
                {s.code}
              </span>
              <button
                className="min-w-0 flex-1 text-left font-semibold hover:underline"
                onClick={() => setSelected(s.code)}
                type="button"
              >
                {s.name}
                <span className="block font-normal text-el-muted text-xs">
                  2022: {s.result2022} · lean {s.leanLabel}
                </span>
              </button>
              <label className="sr-only" htmlFor={`sel-${s.code}`}>
                Your rating for {s.name}
              </label>
              <select
                className="h-9 rounded-md border border-el-rule-2 bg-background px-2 text-sm"
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
