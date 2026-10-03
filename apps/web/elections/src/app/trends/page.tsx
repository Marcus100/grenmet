import type { Metadata } from "next";
import Link from "next/link";
import { ChartViewport } from "@/components/chart-viewport";
import { SeatBar } from "@/components/results/seat-bar";
import { PageHead, Section } from "@/components/section";
import { KeyFacts, ReadingNote } from "@/components/trends/reading-note";
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
import {
  closestResult,
  marginsExample,
  nearestEven,
  officialTurnoutLow,
  partyChanges,
  sweeps,
  turnoutRange,
  voteSeatMismatches,
} from "@/data/trends";
import { fmt, pct } from "@/lib/format";

export const metadata: Metadata = {
  title: "Trends",
  description:
    "Understand Grenada’s elections: why votes and seats differ, what turnout measures, how winning margins work, and what constituency history can tell us. Seven questions, with charts and worked examples.",
};

const LABEL = "font-semibold text-sm text-el-muted uppercase tracking-[0.07em]";
const GENERAL = EVENTS.filter((e) => e.kind === "general");
/** Years labelled on phones, where every election year won't fit. */
const PHONE_YEARS = new Set([1951, 1962, 1972, 1984, 1995, 2003, 2013, 2022]);
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
  const m = { l: 70, r: 70, t: 12, b: 28 };
  const x = (y: number) => m.l + ((y - 1951) / (2022 - 1951)) * (W - m.l - m.r);
  const yv = (v: number) => H - m.b - (v / 0.7) * (H - m.t - m.b);
  return (
    <ChartViewport>
      <svg
        aria-label="Share of the popular vote by party, 1951 to 2022"
        className="h-auto w-full"
        role="img"
        style={{ minWidth: `${W / 16}rem` }}
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
              className="fill-(--el-muted) text-[14px]"
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
            className={`fill-(--el-muted) text-[14px] ${PHONE_YEARS.has(e.year) ? "" : "max-sm:hidden"}`}
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
                  className="fill-(--el-ink) font-semibold text-[14px] max-sm:hidden"
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
    </ChartViewport>
  );
}

function TurnoutChart() {
  const W = 1000;
  const H = 220;
  const m = { l: 70, r: 20, t: 12, b: 28 };
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
    <ChartViewport>
      <svg
        aria-label="Turnout at each election and referendum"
        className="h-auto w-full"
        role="img"
        style={{ minWidth: `${W / 16}rem` }}
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
              className="fill-(--el-muted) text-[14px]"
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
            className={`fill-(--el-muted) text-[14px] ${PHONE_YEARS.has(e.year) ? "" : "max-sm:hidden"}`}
            key={e.id}
            textAnchor="middle"
            x={x(e.year)}
            y={H - 8}
          >
            ’{String(e.year).slice(2)}
          </text>
        ))}
      </svg>
    </ChartViewport>
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
  const n22 = eventNational(data, "2022");
  const share22 = (party: string) => (n22.votes[party] ?? 0) / n22.total;
  const sweepList = sweeps(data);
  const lastSweep = sweepList.at(-1);
  const turnout = turnoutRange(data);
  const lowOfficial = officialTurnoutLow(data);
  const mismatches = voteSeatMismatches(data);
  const marginScale = Math.max(
    1,
    ...Object.values(features).map((f) => f.medianMargin)
  );
  const closestEver = closestResult(data);
  const example = marginsExample(data, "2022");
  const points = (v: number) => (v * 100).toFixed(1);
  const even = nearestEven(results, "2022");
  const changes = partyChanges(data);
  const mostChanged = changes[0];
  const leastChanged = changes.filter(
    (c) => c.changes === changes.at(-1)?.changes
  );
  const names = (codes: { code: (typeof CODES)[number] }[]) =>
    codes.map((c) => constituencyName(results, c.code)).join(", ");

  const facts = [
    {
      figure: pct(share22("NDC")),
      text: (
        <>
          of valid votes went to the NDC in 2022, which won {n22.seats.NDC} of
          the 15 seats. The NNP took {pct(share22("NNP"))} and {n22.seats.NNP}{" "}
          seats.
        </>
      ),
    },
    ...(lastSweep
      ? [
          {
            figure: `${lastSweep.seats} of ${lastSweep.seats}`,
            text: (
              <>
                seats went to the {lastSweep.party} in {lastSweep.year}, on{" "}
                {pct(lastSweep.voteShare)} of the vote. One party has won every
                seat {sweepList.length} times (
                {sweepList.map((w) => w.year).join(", ")}): the candidate with
                the most votes in each constituency wins, so seats can be far
                more lopsided than votes.
              </>
            ),
          },
        ]
      : []),
    {
      figure: pct(turnout.high.turnout),
      text: (
        <>
          of registered voters voted in {turnout.high.year}, the highest turnout
          on record. In 2022 it was {pct(n22.turnout)}.
        </>
      ),
    },
    {
      figure: `${fmt(closestEver.majority)} vote${closestEver.majority === 1 ? "" : "s"}`,
      text: (
        <>
          separated the top two in {constituencyName(results, closestEver.code)}{" "}
          in {closestEver.year}, the closest officially recorded result.
        </>
      ),
    },
    {
      figure: `${points(example.median)} points`,
      text: (
        <>
          was the typical winning margin in 2022: line up all 15 constituency
          margins from closest to widest, and this is the one in the middle.
        </>
      ),
    },
    ...(mostChanged
      ? [
          {
            figure: `${mostChanged.changes} times`,
            text: (
              <>
                {constituencyName(results, mostChanged.code)} has switched to a
                different party since 1972, more than any other constituency.{" "}
                {names(leastChanged)} switched only{" "}
                {leastChanged[0]?.changes === 1
                  ? "once"
                  : `${leastChanged[0]?.changes} times`}
                .
              </>
            ),
          },
        ]
      : []),
  ];

  const recordRow = (a: (typeof contests)[number], value: string) => (
    <li className="flex gap-3 py-2" key={`${a.e.id}${a.code}`}>
      <span className="min-w-0 flex-1">
        <Link
          className="font-semibold hover:underline"
          href={`/elections/${eventSlug(a.e.id)}#${a.code}`}
        >
          {a.e.year} {constituencyName(results, a.code)}
        </Link>
        <span className="block text-base text-el-muted">
          {a.s.winner[0]}, {a.s.winner[1]}
          {a.s.runnerUp &&
            ` over ${a.s.runnerUp[0]}, ${a.s.runnerUp[1]} (${fmt(a.s.winner[2])} to ${fmt(a.s.runnerUp[2])})`}
        </span>
        <span className="block text-el-muted text-sm">
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
        deck="Winning more votes, winning more seats and getting more people to vote are different things. Follow seven questions through Grenada’s election history to see how they fit together."
        eyebrow="The numbers, explained · 1951 to 2022"
        learning="statistics"
        title="How to read an election"
      >
        <nav
          aria-label="Explore the election explainer"
          className="mt-6 border-el-rule border-y py-4"
        >
          <p className={LABEL}>Start with a question</p>
          <ol className="mt-3 grid list-inside list-decimal gap-3 text-base sm:grid-cols-2">
            {[
              ["share", "Who won voters’ support?"],
              ["seats", "Why don’t votes and seats match?"],
              ["turnout", "What does turnout actually tell us?"],
              ["competitive", "What makes an election close?"],
              ["grid", "Which constituencies change sides?"],
              ["lean", "How do we compare NDC and NNP support?"],
              ["records", "Can past results predict the next winner?"],
            ].map(([id, question]) => (
              <li key={id}>
                <a
                  className="underline decoration-el-rule-2 underline-offset-4"
                  href={`#${id}-title`}
                >
                  {question}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <p className="mt-4 max-w-prose text-base text-el-muted leading-relaxed">
          The charts describe recorded results through 2022, not a forecast for
          2026. Figures come from our{" "}
          <Link className="underline underline-offset-4" href="/sources">
            sourced election archive
          </Link>
          ; gaps and differences in the records are explained alongside each
          chart.
        </p>
      </PageHead>

      <Section
        id="share"
        intro="Vote share measures support across the country. It gives each valid vote equal weight, regardless of whether that vote helped elect a constituency’s winner. Start here to see how party support has changed."
        title="1. Who won voters’ support?"
      >
        <ShareChart />
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-base leading-relaxed">
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
        <ReadingNote
          caveats={[
            "A line joins election results, not opinion polls. It does not measure support between elections. GNP, PA and TNP are grouped for this display; they are not a single continuous party.",
          ]}
          example={
            <>
              In 2022, the NDC received {fmt(n22.votes.NDC ?? 0)} of{" "}
              {fmt(n22.total)} valid votes. Divide the first number by the
              second: that is {pct(share22("NDC"))}, or about{" "}
              {Math.round(share22("NDC") * 100)} in every 100 valid votes.
            </>
          }
          findings={[
            `In 2022 the NDC led the NNP by ${points(share22("NDC") - share22("NNP"))} percentage points nationally. That tells us about votes; the next chart explains seats.`,
          ]}
          read="Each line follows one party from one election to the next. The higher the line, the more of the vote that party won. Where two lines cross, the lead changed hands. The hatched band is 1979–83, when there were no elections. Solid dots come from official records; hollow dots (1951–1967 and 1976) come from secondary sources and are less certain."
          terms={[
            {
              term: "Share of the vote",
              meaning:
                "a party’s votes divided by all valid votes, shown as a percentage. 40% means 40 of every 100 valid votes.",
            },
            {
              term: "Valid votes",
              meaning:
                "ballots counted for a candidate. Spoiled or rejected ballots are left out.",
            },
            {
              term: "Secondary source",
              meaning:
                "a figure reported by someone other than the official record, such as a newspaper or Wikipedia.",
            },
          ]}
        />
      </Section>

      <Section
        id="seats"
        intro="Seats are won one constituency at a time. A party’s national vote share is not converted into the same share of seats: where its supporters live, and how narrowly or comfortably it wins, matter."
        title="2. Why don’t votes and seats match?"
      >
        <ol
          className="grid items-end gap-x-[3px] gap-y-1 sm:gap-x-2"
          style={{
            gridTemplateColumns: `repeat(${GENERAL.length}, minmax(0, 1fr))`,
          }}
        >
          {GENERAL.map((e) => (
            <li className="flex flex-col items-center gap-1.5" key={e.id}>
              <SeatBar seats={eventNational(data, e.id).seats} vertical />
              <Link
                aria-label={`Election ${e.year}`}
                className="font-semibold text-sm tabular-nums hover:underline sm:text-base"
                href={`/elections/${eventSlug(e.id)}`}
              >
                <span className="sm:hidden">’{String(e.year).slice(2)}</span>
                <span className="hidden sm:inline">{e.year}</span>
                {!isOfficial(e.id) && (
                  <sup title="Seats from a secondary source">†</sup>
                )}
              </Link>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-base text-el-muted leading-relaxed">
          † From a secondary source, not the official record.
        </p>
        <ReadingNote
          caveats={[
            "An extra vote in a constituency already won by a large margin does not create another seat. National vote share alone cannot show how efficiently support was distributed.",
          ]}
          example={
            <>
              In 2022, {pct(share22("NDC"))} of valid votes gave the NDC{" "}
              {n22.seats.NDC} of 15 seats ({pct((n22.seats.NDC ?? 0) / 15)} of
              the House).{" "}
              {lastSweep && (
                <>
                  In {lastSweep.year}, the {lastSweep.party} won all{" "}
                  {lastSweep.seats} seats with {pct(lastSweep.voteShare)} of the
                  vote. Winning every seat does not mean everyone voted for the
                  winner.
                </>
              )}
            </>
          }
          findings={[
            `One party won every seat in ${sweepList.map((sweep) => sweep.year).join(", ")}. The seat chart shows these as one-colour columns; the vote chart shows support was still divided.`,
            ...mismatches.map(
              (m) =>
                `${m.year}: ${m.mostVotes} won the most votes, but ${m.mostSeats} won the most seats.`
            ),
          ]}
          read="Each column is one election, oldest on the left, in the same order as the charts. Each square is one seat, coloured by the party that won it, with the biggest party at the bottom. Taller columns mean a bigger House; count the squares of one colour to see how many seats that party won. The House had 8 seats until 1957, 10 until 1967 and 15 since 1972."
          terms={[
            {
              term: "Seat",
              meaning:
                "one place in the House of Representatives. Each constituency elects one member.",
            },
            {
              term: "First past the post",
              meaning:
                "Grenada’s voting system. In each constituency the candidate with the most votes wins, even with less than half. So a party can win far more of the seats than of the votes, as in the years one party won every seat.",
            },
            {
              term: "Majority",
              meaning:
                "more than half the seats: 8 of 15 today. The party with a majority forms the government.",
            },
          ]}
        />
      </Section>

      <Section
        id="turnout"
        intro="Turnout asks a different question: how many registered voters took part? It is a share of the voters’ list, not a share of the whole population, and it cannot tell us why someone stayed home."
        title="3. What does turnout actually tell us?"
      >
        <TurnoutChart />
        <ReadingNote
          caveats={[
            "Turnout methods differ between years, so these figures are not an exact like-for-like comparison.",
          ]}
          example={
            <>
              Recorded turnout in 2022 was {pct(n22.turnout)}: roughly{" "}
              {Math.round((n22.turnout ?? 0) * 100)} out of every 100 people on
              the register voted. This does not mean the same share of all
              residents voted; residents and registered voters are different
              groups.
            </>
          }
          findings={[
            `The highest recorded turnout was ${pct(turnout.high.turnout)} in ${turnout.high.year}. The lowest in an official record was ${pct(lowOfficial.turnout)} in ${lowOfficial.year}.`,
          ]}
          read="The line shows each general election; the two diamonds are the 2016 and 2018 referendums. Higher means a bigger share of registered voters turned out. Hollow dots (1951–1967 and 1976) come from secondary sources."
          terms={[
            {
              term: "Turnout",
              meaning:
                "votes cast divided by the number of people on the voters’ list. 70% means 70 of every 100 registered voters voted.",
            },
            {
              term: "Register",
              meaning:
                "the official list of people entitled to vote. Turnout can look low when the list still includes people who have moved away or died.",
            },
            {
              term: "Why the method varies",
              meaning:
                "2013–2022 use ballots cast (PEO reports); 1984–2008 use valid votes, because the PEO table has no rejected ballots; 1972 and 1976 use valid votes over electors (Gazette); 1990 electors and votes cast are from The Grenada Newsletter; before 1972 the figures are from Wikipedia.",
            },
          ]}
        />
      </Section>

      <Section
        id="competitive"
        intro="A close national vote can hide comfortable constituency wins. To see where the contest was tight, compare each winner with the runner-up. Then ask how many constituencies were close, how many switched party, and what a typical winning margin looked like."
        title="4. What makes an election close?"
      >
        <div className="grid gap-8 lg:grid-cols-3">
          <div>
            <h3 className={LABEL}>Marginal, competitive and safe seats</h3>
            <p className="text-base text-el-muted leading-relaxed">
              Winning margin under 5 points, 5–under 15, or 15 and above
            </p>
            <ul className="mt-2 space-y-1 text-base">
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
                          background: "var(--el-seq-1)",
                        }}
                        title={`Marginal ${f.marginal}`}
                      />
                      <span
                        style={{
                          flex: f.competitive,
                          background: "var(--el-seq-0)",
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
                    <span className="w-16 text-right text-base text-el-muted tabular-nums">
                      {f.marginal}·{f.competitive}·{f.safe}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 flex flex-wrap gap-x-3 text-base leading-relaxed">
              <span>
                <i
                  className="mr-1 inline-block size-2.5"
                  style={{ background: "var(--el-seq-1)" }}
                />
                Marginal
              </span>
              <span>
                <i
                  className="mr-1 inline-block size-2.5"
                  style={{ background: "var(--el-seq-0)" }}
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
            <ul className="mt-2 space-y-1 text-base">
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
            <p className="text-base text-el-muted leading-relaxed">
              Median margin between the top two, in points
            </p>
            <ul className="mt-2 space-y-1 text-base">
              {featureYears.map((y) => (
                <li className="flex items-center gap-2" key={y}>
                  <span className="w-10 tabular-nums">{y}</span>
                  <span className="h-3 flex-1 bg-el-paper-2">
                    <span
                      className="block h-full bg-el-seq-1"
                      style={{
                        width: `${((features[y]?.medianMargin ?? 0) / marginScale) * 100}%`,
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
        <ReadingNote
          caveats={[
            "Marginal, competitive and safe are descriptive bands for past results, not guarantees about the next election. A national swing need not happen equally in every constituency.",
          ]}
          example="Illustration: a winner with 52% and a runner-up with 44% has an 8-point margin. If 4 percentage points of votes moved directly from the winner to the runner-up, both would have 48%. A margin and the swing needed to erase it are not the same number."
          findings={[
            `In 2022, the middle of the 15 winning margins was ${points(example.median)} points. Half the margins lay on either side of that middle result.`,
          ]}
          read={
            <>
              Each row is one election. On the left, the bar splits the 15
              constituencies into close, fairly close and comfortable wins. In
              the middle, a longer bar means more constituencies switched party
              from the election before. On the right, a longer bar means the
              typical winner won more easily. For example, in 2022 the 15
              margins ran from {points(example.margins[0] ?? 0)} to{" "}
              {points(example.margins.at(-1) ?? 0)} points; the eighth, in the
              middle, was {points(example.median)}.
            </>
          }
          terms={[
            {
              term: "Winning margin",
              meaning:
                "the winner’s share of the vote minus the runner-up’s, in percentage points. A winner on 52% against 44% has a margin of 8 points.",
            },
            {
              term: "Percentage points",
              meaning:
                "the plain difference between two percentages. Going from 40% to 45% is a rise of 5 points.",
            },
            {
              term: "Marginal, competitive, safe",
              meaning:
                "a margin under 5 points, from 5 to under 15, or 15 and above. Marginal seats are the ones most likely to change hands.",
            },
            {
              term: "Changed hands",
              meaning:
                "won by a different party from the one that won it at the previous election.",
            },
            {
              term: "Median",
              meaning:
                "the middle value once all the values are lined up in order. Unlike an average, one landslide cannot drag it up.",
            },
          ]}
        />
      </Section>

      <Section
        id="grid"
        intro="National totals hide local stories. Follow one row to see whether a constituency keeps electing the same party or changes hands. The table starts in 1972, when the House expanded to 15 seats; earlier elections had fewer constituencies."
        title="5. Which constituencies change sides?"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-[3px] text-base">
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
        <p className="mt-2 text-base text-el-muted leading-relaxed">
          † 1976 votes are from The Grenada Newsletter’s report of the
          Supervisor of Elections’ figures, not the official record.
        </p>
        <ReadingNote
          caveats={[
            "These are election-day winners. Defections, by-elections and changes between general elections are not shown. The table does not tell us whether individual voters changed their minds.",
          ]}
          example={
            <>
              Read across St. Mark: GULP won in 1972 and 1976; NNP won at every
              general election shown from 1984 onwards. That counts as one
              change of winning party, even though the constituency voted many
              times.
            </>
          }
          findings={
            mostChanged
              ? [
                  `${constituencyName(results, mostChanged.code)} changed winning party ${mostChanged.changes} times across the elections shown. ${names(leastChanged)} changed least often.`,
                ]
              : []
          }
          read="Each row is a constituency and each column an election. The colour and letters show which party won. Read along a row for one constituency’s history: a run of one colour is a stronghold, a mix of colours is a swing constituency. Read down a column to see one election. There were no elections between 1979 and 1983."
          terms={[
            {
              term: "Party letters",
              meaning: (
                <>
                  GULP is the Grenada United Labour Party, NNP the New National
                  Party and NDC the National Democratic Congress. See{" "}
                  <Link
                    className="underline underline-offset-2"
                    href="/parties"
                  >
                    every party
                  </Link>
                  .
                </>
              ),
            },
            {
              term: "Stronghold",
              meaning: "a constituency that keeps electing the same party.",
            },
          ]}
        />
      </Section>

      <Section
        id="lean"
        intro="These charts isolate the contest between the NDC and NNP. They ask: of the votes cast for those two parties, what share went to the NDC? That makes movement between them easier to see, while leaving smaller parties out of the picture."
        title="6. How do we compare NDC and NNP support?"
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
                  className="font-semibold text-base hover:underline"
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
        <ReadingNote
          caveats={[
            "Two-party share excludes every other candidate. A point above 50% says NDC beat NNP, not necessarily that NDC beat every candidate or won a majority of all votes.",
          ]}
          example="Illustration: NDC wins 45 votes, NNP 45 and other candidates 10. NDC has 45% of all valid votes, but 50% of the NDC–NNP vote: 45 ÷ (45 + 45). A dot on the dashed line means the two parties tied, not that either won half of all votes."
          findings={[
            `${constituencyName(results, even.code)} was closest to an even NDC–NNP split in 2022, with ${pct(even.share)} of their combined vote going to the NDC.`,
          ]}
          read={
            <>
              Each small chart is one constituency, from 1990 on the left to
              2022 on the right. The dashed line is an even split. A dot above
              it means the NDC got more votes than the NNP; below it, the NNP
              did. The further from the line, the bigger the lead. In 2022{" "}
              {constituencyName(results, even.code)} was the closest to the
              line, at {pct(even.share)} NDC.
            </>
          }
          terms={[
            {
              term: "Two-party share",
              meaning:
                "NDC votes divided by NDC plus NNP votes. Leaving out smaller parties puts every election on the same 0–100% scale, so they can be compared.",
            },
            {
              term: "Swing",
              meaning:
                "how far the line moves between two elections. A move from 45% to 52% is a 7-point swing to the NDC.",
            },
          ]}
        />
      </Section>

      <Section
        id="records"
        intro="History shows what happened, not what must happen next. These records identify the closest contests, biggest winning shares and constituencies that often backed the national winner. The result rankings use official records only (1972 and 1984–2022)."
        title="7. Can past results predict the next winner?"
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
            <p className="text-base text-el-muted leading-relaxed">
              How often each constituency backed the party that won most seats,
              1984–2022 ({bellYears.length} elections)
            </p>
            <ol className="mt-1 divide-y divide-el-rule text-base">
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
        <ReadingNote
          caveats={[
            "A constituency’s past record does not guarantee its next result. Candidates, turnout and party support can change; these tables do not estimate the chance of a future win.",
          ]}
          example={
            <>
              The closest officially recorded result here was{" "}
              {constituencyName(results, closestEver.code)} in{" "}
              {closestEver.year}: a margin of {fmt(closestEver.majority)} vote
              {closestEver.majority === 1 ? "" : "s"}. That measures the gap in
              ballot counts; the biggest-win list instead ranks the winner’s
              percentage of valid votes.
            </>
          }
          findings={[
            "A bellwether has often elected a member of the party that won most seats nationally. This is a description of its track record, not a reason that it determines the national result.",
          ]}
          read="Each list is ranked from the top. Click a result to see the full count for that constituency and year."
          terms={[
            {
              term: "Majority",
              meaning:
                "the winner’s votes minus the runner-up’s votes. A majority of 1 means one more vote would have tied it.",
            },
            {
              term: "Biggest win",
              meaning:
                "the winner’s share of all valid votes in the constituency.",
            },
            {
              term: "Bellwether",
              meaning:
                "a constituency that usually votes for the party that goes on to win the most seats nationally.",
            },
          ]}
        />
      </Section>
      <Section
        id="practice"
        intro="Before opening each answer, work through the claim. These are illustrative scenarios, not Grenada election results."
        title="Try explaining it yourself"
      >
        <div className="divide-y divide-el-rule border-el-rule border-y">
          {[
            {
              question:
                "A party wins 60% of the national vote. Must it win 9 of 15 seats?",
              answer:
                "No. Sixty per cent of 15 is 9, but Grenada does not allocate seats in proportion to national votes. Each constituency elects its own winner. We need the constituency results to know the seat total.",
              lesson: "seats",
            },
            {
              question:
                "Turnout falls from 75% to 70%. Does that prove fewer people voted?",
              answer:
                "No. The voters’ list may have grown. With 1,000 registered voters, 75% turnout means 750 voted. With 1,200 registered voters, 70% means 840 voted: more people, but a smaller share. Always check both the count and the denominator.",
              lesson: "turnout",
            },
            {
              question:
                "NDC has 55% of the NDC–NNP vote. Does that prove it won the constituency?",
              answer:
                "No. Imagine NDC has 44 votes, NNP 36 and another candidate 50. NDC has 44 ÷ 80 = 55% of the two-party vote, but the other candidate has the most votes and wins. Check the full result before drawing a conclusion.",
              lesson: "lean",
            },
          ].map(({ question, answer, lesson }) => (
            <details className="py-4" key={lesson}>
              <summary className="cursor-pointer font-semibold">
                {question}
              </summary>
              <p className="mt-3 max-w-prose text-el-ink-2 leading-relaxed">
                {answer}
              </p>
              <a
                className="mt-3 inline-block text-base underline underline-offset-4"
                href={`#${lesson}-title`}
              >
                Revisit the explanation
              </a>
            </details>
          ))}
        </div>
        <p className="mt-6 max-w-prose text-el-ink-2 leading-relaxed">
          When you encounter an election claim, ask: what is being counted, what
          is it being divided by, which year and constituency does it cover, and
          where is the source? Those four questions help you judge the claim for
          yourself.
        </p>
        <p className="mt-4 text-base leading-relaxed">
          Put this into practice with{" "}
          <Link className="underline underline-offset-4" href="/results">
            full election results
          </Link>
          , explore{" "}
          <Link className="underline underline-offset-4" href="/constituencies">
            your constituency
          </Link>
          , or inspect{" "}
          <Link className="underline underline-offset-4" href="/sources">
            the source records
          </Link>
          .
        </p>
      </Section>
      <Section
        id="facts"
        intro="A quick reference to the results behind this explainer."
        title="The figures to take away"
      >
        <KeyFacts facts={facts} />
      </Section>
    </>
  );
}
