import type { Metadata } from "next";
import Link from "next/link";
import { SeatBar } from "@/components/results/seat-bar";
import { PageHead, Section } from "@/components/section";
import {
  eventNational,
  eventResult,
  eventSlug,
  eventSource,
  isOfficial,
} from "@/data/events";
import { data, features, results } from "@/data/load";
import {
  CODES,
  constituencyHref,
  constituencyName,
  contestStats,
  EVENTS,
  MAPPED_YEARS,
  seatTwoParty,
} from "@/data/model";
import { partyColor, partyFillIsDark } from "@/data/parties";
import { fmt, pct } from "@/lib/format";

export const metadata: Metadata = {
  title: "Trends",
  description:
    "Seventy years of Grenada’s votes: party share, seats and turnout since 1951, how competitive each election was, and how each constituency has voted since 1972.",
};

const LABEL =
  "font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]";
const GENERAL = EVENTS.filter((e) => e.kind === "general");
const MAIN = new Set(["GULP", "MMWU", "NNP", "NDC", "GNP", "PA", "TNP"]);

const SERIES = [
  { key: "NDC", label: "NDC", parties: ["NDC"], colour: partyColor("NDC") },
  { key: "NNP", label: "NNP", parties: ["NNP"], colour: partyColor("NNP") },
  {
    key: "GULP",
    label: "GULP (with the MMWU in 1951)",
    parties: ["GULP", "MMWU"],
    colour: partyColor("GULP"),
  },
  {
    key: "GNP",
    label: "GNP · PA · TNP",
    parties: ["GNP", "PA", "TNP"],
    colour: partyColor("GNP"),
  },
  {
    key: "OTHER",
    label: "Other parties and independents",
    parties: [],
    colour: "var(--el-other)",
  },
];

function seriesShare(id: string, parties: string[]): number {
  const n = eventNational(data, id);
  const votes = parties.length
    ? parties.reduce((a, p) => a + (n.votes[p] ?? 0), 0)
    : Object.entries(n.votes)
        .filter(([p]) => !MAIN.has(p))
        .reduce((a, [, v]) => a + v, 0);
  return n.total ? votes / n.total : 0;
}

function ShareChart() {
  const W = 1000;
  const H = 360;
  const m = { l: 40, r: 70, t: 12, b: 28 };
  const x = (y: number) => m.l + ((y - 1951) / (2022 - 1951)) * (W - m.l - m.r);
  const yv = (v: number) => H - m.b - (v / 0.7) * (H - m.t - m.b);
  return (
    <svg
      aria-label="Share of the popular vote by party, 1951 to 2022"
      className="h-auto w-full"
      role="img"
      viewBox={`0 0 ${W} ${H}`}
    >
      <defs>
        <pattern
          height="6"
          id="hatch"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
          width="6"
        >
          <line stroke="var(--el-rule-2)" x1="0" x2="0" y1="0" y2="6" />
        </pattern>
      </defs>
      <rect
        fill="url(#hatch)"
        height={H - m.t - m.b}
        width={x(1984) - x(1979)}
        x={x(1979)}
        y={m.t}
      />
      {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((v) => (
        <g key={v}>
          <line
            stroke="var(--el-rule)"
            x1={m.l}
            x2={W - m.r}
            y1={yv(v)}
            y2={yv(v)}
          />
          <text
            className="fill-(--el-muted) text-[12px]"
            textAnchor="end"
            x={m.l - 6}
            y={yv(v) + 4}
          >
            {Math.round(v * 100)}%
          </text>
        </g>
      ))}
      {GENERAL.map((e) => (
        <text
          className="fill-(--el-muted) text-[12px]"
          key={e.id}
          textAnchor="middle"
          x={x(e.year)}
          y={H - 8}
        >
          ’{String(e.year).slice(2)}
        </text>
      ))}
      {SERIES.map((s) => {
        const points = GENERAL.map((e, i) => ({
          e,
          i,
          v: seriesShare(e.id, s.parties),
        })).filter((p) => p.v > 0.004);
        let d = "";
        let prev: number | null = null;
        for (const p of points) {
          d += `${prev !== null && p.i === prev + 1 ? "L" : "M"}${x(p.e.year)},${yv(p.v)}`;
          prev = p.i;
        }
        const last = points.at(-1);
        return (
          <g key={s.key}>
            <path
              d={d}
              fill="none"
              stroke={s.colour}
              strokeLinejoin="round"
              strokeWidth={2.2}
            />
            {points.map((p) => (
              <circle
                cx={x(p.e.year)}
                cy={yv(p.v)}
                fill={isOfficial(p.e.id) ? s.colour : "var(--el-paper)"}
                key={p.e.id}
                r={3.6}
                stroke={isOfficial(p.e.id) ? "var(--el-paper)" : s.colour}
                strokeWidth={1.8}
              >
                <title>{`${p.e.year}, ${s.label}: ${pct(p.v)}${isOfficial(p.e.id) ? "" : " (secondary source)"}`}</title>
              </circle>
            ))}
            {last && ["NDC", "NNP", "GULP"].includes(s.key) && (
              <text
                className="fill-(--el-ink) font-semibold text-[12px]"
                x={x(last.e.year) + 8}
                y={yv(last.v) + 4}
              >
                {s.key}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function TurnoutChart() {
  const W = 1000;
  const H = 220;
  const m = { l: 40, r: 20, t: 12, b: 28 };
  const x = (y: number) => m.l + ((y - 1951) / (2022 - 1951)) * (W - m.l - m.r);
  const yv = (v: number) => H - m.b - v * (H - m.t - m.b);
  const elections = GENERAL.map((e) => ({
    e,
    t: eventNational(data, e.id).turnout,
  })).filter(
    (p): p is { e: (typeof GENERAL)[number]; t: number } => p.t != null
  );
  const refs = EVENTS.filter((e) => e.kind === "ref").map((e) => ({
    e,
    t: eventNational(data, e.id).turnout ?? 0,
  }));
  return (
    <svg
      aria-label="Turnout at each election and referendum"
      className="h-auto w-full"
      role="img"
      viewBox={`0 0 ${W} ${H}`}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line
            stroke="var(--el-rule)"
            x1={m.l}
            x2={W - m.r}
            y1={yv(v)}
            y2={yv(v)}
          />
          <text
            className="fill-(--el-muted) text-[12px]"
            textAnchor="end"
            x={m.l - 6}
            y={yv(v) + 4}
          >
            {v * 100}%
          </text>
        </g>
      ))}
      <polyline
        fill="none"
        points={elections.map((p) => `${x(p.e.year)},${yv(p.t)}`).join(" ")}
        stroke="var(--el-seq-1)"
        strokeWidth={2.2}
      />
      {elections.map((p) => (
        <circle
          cx={x(p.e.year)}
          cy={yv(p.t)}
          fill={isOfficial(p.e.id) ? "var(--el-seq-1)" : "var(--el-paper)"}
          key={p.e.id}
          r={3.8}
          stroke="var(--el-seq-1)"
          strokeWidth={1.8}
        >
          <title>{`${p.e.year}: ${pct(p.t)}`}</title>
        </circle>
      ))}
      {refs.map((p) => (
        <rect
          fill="var(--el-ink-2)"
          height={8}
          key={p.e.id}
          transform={`rotate(45 ${x(p.e.year + (p.e.id === "2018r" ? 0.6 : 0))} ${yv(p.t)})`}
          width={8}
          x={x(p.e.year + (p.e.id === "2018r" ? 0.6 : 0)) - 4}
          y={yv(p.t) - 4}
        >
          <title>{`${p.e.year} referendum: ${pct(p.t)}`}</title>
        </rect>
      ))}
      {GENERAL.map((e) => (
        <text
          className="fill-(--el-muted) text-[12px]"
          key={e.id}
          textAnchor="middle"
          x={x(e.year)}
          y={H - 8}
        >
          ’{String(e.year).slice(2)}
        </text>
      ))}
    </svg>
  );
}

export default function TrendsPage() {
  const featureYears = Object.keys(features).sort();
  const official = GENERAL.filter((e) => isOfficial(e.id) && e.map);
  const contests = official.flatMap((e) =>
    CODES.flatMap((code) => {
      const r = eventResult(data, e.id, code);
      return r && r.c.length > 1 ? [{ e, code, r, s: contestStats(r) }] : [];
    })
  );
  const closest = [...contests]
    .sort((a, b) => a.s.majority - b.s.majority)
    .slice(0, 10);
  const biggest = [...contests]
    .sort((a, b) => b.s.winner[2] / b.s.valid - a.s.winner[2] / a.s.valid)
    .slice(0, 10);
  const bellYears = MAPPED_YEARS.filter((y) => y >= 1984).map(String);
  const bellwethers = CODES.map((code) => {
    let k = 0;
    for (const y of bellYears) {
      const n = eventNational(data, y);
      const gov = Object.entries(n.seats).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (eventResult(data, y, code)?.c[0]?.[1] === gov) k++;
    }
    return { code, k };
  }).sort((a, b) => b.k - a.k);
  const recordRow = (a: (typeof contests)[number], value: string) => (
    <li className="flex gap-3 py-2" key={`${a.e.id}${a.code}`}>
      <span className="min-w-0 flex-1">
        <Link
          className="font-semibold hover:underline"
          href={`/elections/${eventSlug(a.e.id)}#${a.code}`}
        >
          {a.e.year} {constituencyName(results, a.code)}
        </Link>
        <span className="block text-el-muted text-xs">
          {a.s.winner[0]}, {a.s.winner[1]}
          {a.s.runnerUp &&
            ` over ${a.s.runnerUp[0]}, ${a.s.runnerUp[1]} (${fmt(a.s.winner[2])} to ${fmt(a.s.runnerUp[2])})`}
        </span>
        <span className="block text-[11px] text-el-muted">
          {eventSource(data, a.e.id, a.code).text}
          {a.r.note && " · PEO discrepancy noted"}
          {a.r.derived && " · derived total"}
        </span>
      </span>
      <b className="shrink-0 tabular-nums">{value}</b>
    </li>
  );

  return (
    <>
      <PageHead
        deck="How party support, seats and turnout have moved since universal suffrage in 1951, and how each of today’s 15 constituencies has voted since 1972. Hover any chart for the figures."
        eyebrow="Trends · 1951 to 2022"
        title="Seventy years of Grenada’s votes"
      />

      <Section id="share" title="Share of the popular vote">
        <ShareChart />
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {SERIES.map((s) => (
            <span key={s.key}>
              <i
                className="mr-1.5 inline-block size-2.5 rounded-[2px] align-[-1px]"
                style={{ background: s.colour }}
              />
              {s.label}
            </span>
          ))}
        </p>
        <p className="mt-2 max-w-[70ch] text-el-muted text-xs">
          The hatched band marks 1979–83, when there were no elections. Hollow
          points are from secondary sources, not an official record (1951–1967
          and 1976).
        </p>
      </Section>

      <Section
        id="seats"
        intro="One square per seat. The House had 8 seats until 1957, 10 until 1967 and 15 since 1972."
        title="Seats won"
      >
        <ol className="space-y-1.5">
          {[...GENERAL].reverse().map((e) => (
            <li className="flex items-center gap-3 text-sm" key={e.id}>
              <Link
                className="w-12 shrink-0 font-semibold tabular-nums hover:underline"
                href={`/elections/${eventSlug(e.id)}`}
              >
                {e.year}
              </Link>
              <SeatBar seats={eventNational(data, e.id).seats} />
              {!isOfficial(e.id) && (
                <span className="text-el-muted text-xs">secondary source</span>
              )}
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="turnout"
        intro="Share of registered voters who voted. 2013–2022 use ballots cast (PEO reports); 1984–2008 use valid votes (the PEO table has no rejected ballots); 1972 and 1976 use valid votes over electors (Gazette); 1990 electors and votes cast are from The Grenada Newsletter; before 1972 the figures are from Wikipedia (secondary, hollow). Diamonds are referendums."
        title="Turnout"
      >
        <TurnoutChart />
      </Section>

      <Section
        id="competitive"
        intro="Derived from every constituency result under the current 15-seat map."
        title="How competitive each election was"
      >
        <div className="grid gap-8 lg:grid-cols-3">
          <div>
            <h3 className={LABEL}>Marginal, competitive and safe seats</h3>
            <p className="text-el-muted text-xs">
              Winning margin under 5 points, 5–15, or over 15
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {featureYears.map((y) => {
                const f = features[y];
                if (!f) return null;
                return (
                  <li className="flex items-center gap-2" key={y}>
                    <span className="w-10 tabular-nums">{y}</span>
                    <span className="flex h-3 flex-1 gap-px">
                      <span
                        style={{
                          flex: f.marginal,
                          background: "var(--el-gulp)",
                        }}
                        title={`Marginal ${f.marginal}`}
                      />
                      <span
                        style={{
                          flex: f.competitive,
                          background: "var(--el-ndc)",
                        }}
                        title={`Competitive ${f.competitive}`}
                      />
                      <span
                        style={{
                          flex: f.safe,
                          background: "var(--el-div-mid)",
                        }}
                        title={`Safe ${f.safe}`}
                      />
                    </span>
                    <span className="w-16 text-right text-el-muted text-xs tabular-nums">
                      {f.marginal}·{f.competitive}·{f.safe}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 flex flex-wrap gap-x-3 text-xs">
              <span>
                <i
                  className="mr-1 inline-block size-2.5"
                  style={{ background: "var(--el-gulp)" }}
                />
                Marginal
              </span>
              <span>
                <i
                  className="mr-1 inline-block size-2.5"
                  style={{ background: "var(--el-ndc)" }}
                />
                Competitive
              </span>
              <span>
                <i
                  className="mr-1 inline-block size-2.5"
                  style={{ background: "var(--el-div-mid)" }}
                />
                Safe
              </span>
            </p>
          </div>
          <div>
            <h3 className={LABEL}>Seats that changed hands</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {featureYears
                .filter((y) => features[y]?.flips != null)
                .map((y) => (
                  <li className="flex items-center gap-2" key={y}>
                    <span className="w-10 tabular-nums">{y}</span>
                    <span className="h-3 flex-1 bg-el-paper-2">
                      <span
                        className="block h-full bg-el-ink-2"
                        style={{
                          width: `${((features[y]?.flips ?? 0) / 15) * 100}%`,
                        }}
                      />
                    </span>
                    <span className="w-8 text-right tabular-nums">
                      {features[y]?.flips}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
          <div>
            <h3 className={LABEL}>Typical winning margin</h3>
            <p className="text-el-muted text-xs">
              Median margin between the top two, in points
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {featureYears.map((y) => (
                <li className="flex items-center gap-2" key={y}>
                  <span className="w-10 tabular-nums">{y}</span>
                  <span className="h-3 flex-1 bg-el-paper-2">
                    <span
                      className="block h-full bg-el-seq-1"
                      style={{
                        width: `${((features[y]?.medianMargin ?? 0) / 30) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="w-10 text-right tabular-nums">
                    {features[y]?.medianMargin.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section
        id="grid"
        intro="Who won each of the 15 constituencies at every general election under the current map. The gap marks 1979–83, when there were no elections."
        title="Every seat since 1972"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-[3px] text-xs">
            <thead>
              <tr>
                <th className="text-left font-semibold" scope="col">
                  Constituency
                </th>
                {MAPPED_YEARS.map((y) => (
                  <th
                    className="font-semibold tabular-nums"
                    key={y}
                    scope="col"
                  >
                    <Link className="hover:underline" href={`/elections/${y}`}>
                      {y}
                    </Link>
                    {!isOfficial(String(y)) && (
                      <sup title="Votes from a secondary source">†</sup>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CODES.map((code) => (
                <tr key={code}>
                  <th className="pr-2 text-left font-normal" scope="row">
                    <Link
                      className="hover:underline"
                      href={constituencyHref(results, code)}
                    >
                      {constituencyName(results, code)}
                    </Link>
                  </th>
                  {MAPPED_YEARS.map((y) => {
                    const w = eventResult(data, String(y), code)?.c[0];
                    return (
                      <td
                        className="h-7 min-w-10 rounded-[2px] text-center font-semibold"
                        key={y}
                        style={
                          w
                            ? {
                                background: partyColor(w[1]),
                                color: partyFillIsDark(w[1])
                                  ? "#fff"
                                  : "#121314",
                              }
                            : undefined
                        }
                        title={w ? `${y}: ${w[0]}, ${w[1]}` : `${y}: no result`}
                      >
                        {w?.[1] ?? "–"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-el-muted text-xs">
          † 1976 votes are from The Grenada Newsletter’s report of the
          Supervisor of Elections’ figures, not the official record.
        </p>
      </Section>

      <Section
        id="lean"
        intro="The NDC’s share of the two-party vote (NDC plus NNP) at each election since the NDC first stood in 1990. Above the line, the NDC led."
        title="How each constituency leans"
      >
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {CODES.map((code) => {
            const years = MAPPED_YEARS.filter((y) => y >= 1990).map(String);
            const pts = years
              .map((y, i) => ({ i, v: seatTwoParty(results, y, code) }))
              .filter((p): p is { i: number; v: number } => p.v != null);
            const W = 160;
            const H = 70;
            const px = (i: number) => 6 + (i / (years.length - 1)) * (W - 12);
            const py = (v: number) => H - 6 - v * (H - 12);
            return (
              <li key={code}>
                <Link
                  className="font-semibold text-sm hover:underline"
                  href={constituencyHref(results, code)}
                >
                  {constituencyName(results, code)}
                </Link>
                <svg
                  aria-label={`NDC two-party share in ${constituencyName(results, code)}, 1990 to 2022`}
                  className="mt-1 h-auto w-full"
                  role="img"
                  viewBox={`0 0 ${W} ${H}`}
                >
                  <line
                    stroke="var(--el-ink)"
                    strokeDasharray="2 2"
                    x1={0}
                    x2={W}
                    y1={py(0.5)}
                    y2={py(0.5)}
                  />
                  <polyline
                    fill="none"
                    points={pts.map((p) => `${px(p.i)},${py(p.v)}`).join(" ")}
                    stroke="var(--el-ink-2)"
                    strokeWidth={1.5}
                  />
                  {pts.map((p) => (
                    <circle
                      cx={px(p.i)}
                      cy={py(p.v)}
                      fill={partyColor(p.v > 0.5 ? "NDC" : "NNP")}
                      key={p.i}
                      r={3}
                    >
                      <title>{`${years[p.i]}: NDC ${pct(p.v)} of the NDC–NNP vote`}</title>
                    </circle>
                  ))}
                </svg>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        id="records"
        intro="From officially sourced results only (1972 and 1984–2022)."
        title="Records"
      >
        <div className="grid gap-8 lg:grid-cols-3">
          <div>
            <h3 className={LABEL}>Closest results</h3>
            <ol className="divide-y divide-el-rule">
              {closest.map((a) => recordRow(a, `${fmt(a.s.majority)} votes`))}
            </ol>
          </div>
          <div>
            <h3 className={LABEL}>Biggest wins</h3>
            <ol className="divide-y divide-el-rule">
              {biggest.map((a) => recordRow(a, pct(a.s.winner[2] / a.s.valid)))}
            </ol>
          </div>
          <div>
            <h3 className={LABEL}>Bellwethers</h3>
            <p className="text-el-muted text-xs">
              How often each constituency backed the party that won most seats,
              1984–2022 ({bellYears.length} elections)
            </p>
            <ol className="mt-1 divide-y divide-el-rule text-sm">
              {bellwethers.map((b) => (
                <li className="flex justify-between gap-3 py-1.5" key={b.code}>
                  <Link
                    className="hover:underline"
                    href={constituencyHref(results, b.code)}
                  >
                    {constituencyName(results, b.code)}
                  </Link>
                  <span className="tabular-nums">
                    {b.k} of {bellYears.length}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>
    </>
  );
}
