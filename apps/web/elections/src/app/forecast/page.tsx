import type { Metadata } from "next";
import Link from "next/link";
import { Flag } from "@/components/flag";
import { Forecast, type ForecastSeat } from "@/components/forecast/forecast";
import { FlatMap } from "@/components/map/flat-map";
import { SeatSquare } from "@/components/party-chip";
import { PageHead, Section } from "@/components/section";
import { SourceLink } from "@/components/source-link";
import { campaign, geo, results } from "@/data/load";
import {
  CODES,
  constituencyHref,
  constituencyName,
  constituencyShortName,
  divisionResults,
  leanLabel,
  pollScore,
} from "@/data/model";
import {
  backtest,
  leanTable,
  modelInputs,
  nationalShare,
  spreads,
} from "@/data/outlook";
import { partyColor } from "@/data/parties";
import type { ConstituencyCode } from "@/data/types";
import { leanFill } from "@/lib/colors";
import { fmt, formatIsoDate, pct } from "@/lib/format";

export const metadata: Metadata = {
  title: "Forecast",
  description:
    "Where Grenada’s 2026 election will be decided: the Grenada Lean Index, seat ratings, 10,000 simulated elections, a backtest against every election since 1990, and every published poll.",
};

const LABEL =
  "font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]";

const CHANGE_LOG = [
  {
    date: "27 September 2026",
    what: "Model v0.2: DPM added",
    why: "The DPM is standing in 8 seats, so seat chances are now three-way. The DPM’s size and which party it draws from are assumptions ✱ until a poll or result gives them. National swing now has fatter tails and local noise uses the three elections since 2008, both chosen by backtest.",
  },
  {
    date: "27 September 2026",
    what: "First ratings published",
    why: "Calculated from the 2018 and 2022 official results, with the national vote as in 2022.",
  },
];

const STILL_NEEDED = [
  "DPB Global’s full 2026 report: party shares, questionnaire, sample design and fieldwork dates.",
  "CADRES’s Grenada poll archive, including the original June 2008 release and any polls from 2012–2022.",
  "The NDC’s candidate slate for the next election.",
  "The NNP candidate for St. Andrew North West.",
  "House of Representatives Hansard for 31 August 2022, which confirms the first sitting and so the deadline.",
  "Any poll that measures DPM support. The DPM settings above are assumptions until then.",
];

function twoPartyOf(c: [string, string, number, unknown?][]): number | null {
  const ndc = c.filter((r) => r[1] === "NDC").reduce((a, r) => a + r[2], 0);
  const nnp = c.filter((r) => r[1] === "NNP").reduce((a, r) => a + r[2], 0);
  return ndc + nnp ? ndc / (ndc + nnp) : null;
}

export default function ForecastPage() {
  const sp = spreads(results, null);
  const lean = leanTable(results, "2022");
  const dpbPoll = campaign.polls.find((p) => p.id === "dpb26") as unknown as {
    bases: { NDC: [number, number]; NNP: [number, number] };
  };
  const inputs = modelInputs(results, dpbPoll.bases);
  const dpmSlate = campaign.candidates.DPM ?? {};
  const n22 = nationalShare(results, "2022");
  const n18 = nationalShare(results, "2018");
  const maxSwing = Math.max(...sp.nat.map(Math.abs));

  const seats: ForecastSeat[] = CODES.map((code) => ({
    code,
    short: constituencyShortName(results, code),
    href: constituencyHref(results, code),
    lean: lean[code],
    ...(dpmSlate[code] ? { dpmCandidate: dpmSlate[code] } : {}),
  }));

  // Division lean: 75% 2022 and 25% 2018 where the division existed then.
  const div18 = Object.fromEntries(
    CODES.flatMap((c) => divisionResults(results, "2018", c)).map((d) => [
      d.division,
      d,
    ])
  );
  const divisions = CODES.flatMap((c) => divisionResults(results, "2022", c))
    .map((d) => {
      const now = twoPartyOf(d.c);
      const before = div18[d.division]
        ? twoPartyOf(div18[d.division]?.c ?? [])
        : null;
      if (now == null) return null;
      return {
        division: d.division,
        code: d.division.slice(0, 1) as ConstituencyCode,
        place: d.places[0] ?? "",
        lean:
          before == null
            ? now - n22
            : 0.75 * (now - n22) + 0.25 * (before - n18),
        only2022: before == null,
      };
    })
    .filter((d) => d !== null);
  const divisionLean = Object.fromEntries(
    divisions.map((d) => [d.division, d])
  );
  const closestDivisions = [...divisions]
    .sort((a, b) => Math.abs(a.lean) - Math.abs(b.lean))
    .slice(0, 12);

  const ladder = [...CODES].sort((a, b) => lean[a] - lean[b]);
  const { rows, calibration } = backtest(results);
  const inside = rows.filter((r) => r.inside).length;
  const called = rows.reduce((a, r) => a + r.right, 0);
  const brier =
    calibration.reduce((a, r) => a + (r.p - (r.won ? 1 : 0)) ** 2, 0) /
    calibration.length;

  const scored = campaign.polls
    .map((p) => ({ poll: p, score: pollScore(results, p) }))
    .filter(
      (
        x
      ): x is {
        poll: (typeof campaign.polls)[number];
        score: NonNullable<ReturnType<typeof pollScore>>;
      } => x.score !== null
    );
  const meanError =
    scored.reduce((a, x) => a + x.score.error, 0) / scored.length;
  const dpbShare = inputs.presets.dpb;

  return (
    <>
      <PageHead
        deck={
          <>
            The next general election must be held by 30 November 2027
            <Flag
              note="Five years from the first sitting on 31 August 2022 (Wikipedia), plus 90 days. The first sitting needs confirming from the House Hansard."
              status="unverified"
            />
            , and the Prime Minister is due to announce the date on 4 October
            2026 (<SourceLink id="conch" sources={campaign.sources} />
            ). These tools use only past official results. Treat them as a range
            of possibilities, not a prediction.
          </>
        }
        eyebrow="Forecast · General election 2026"
        title="Where the next election will be decided"
      >
        <dl className="mt-6 grid grid-cols-2 gap-4 border-el-rule border-t pt-4 lg:grid-cols-4">
          {[
            [
              "NDC two-party share, 2022",
              pct(n22),
              "the national starting point",
            ],
            [
              "Typical national swing",
              `±${(sp.sN * 100).toFixed(1)}`,
              `points between elections, 1990–2022 (largest ${(maxSwing * 100).toFixed(0)})`,
            ],
            [
              "Typical local deviation",
              `±${(sp.sL * 100).toFixed(1)}`,
              `points from the national swing since 2008 (±${(sp.sLall * 100).toFixed(1)} over 1990–2022)`,
            ],
            [
              "Seats within 5 points of even",
              String(CODES.filter((c) => Math.abs(lean[c]) < 0.05).length),
              "of 15, by the Lean Index",
            ],
          ].map(([label, value, note]) => (
            <div key={label}>
              <dt className={LABEL}>{label}</dt>
              <dd className="mt-0.5 font-semibold text-xl tabular-nums">
                {value}
              </dd>
              <dd className="text-el-muted text-xs">{note}</dd>
            </div>
          ))}
        </dl>
      </PageHead>

      <Section
        id="lean"
        intro="How much more NDC or NNP each place votes than Grenada as a whole: the NDC–NNP vote in 2022 (75%) and 2018 (25%), relative to the nation. NNP+7 means the NNP’s two-party share there ran about 7 points above its national share. The method follows the Cook Political Report’s Partisan Voting Index."
        title="1 · Grenada Lean Index"
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <figure>
            <FlatMap
              geo={geo}
              label="Lean of each constituency"
              regions={CODES.map((code) => ({
                code,
                fill: leanFill(lean[code]),
                href: constituencyHref(results, code),
                title: `${constituencyName(results, code)}: ${leanLabel(lean[code])}`,
              }))}
            />
            <figcaption className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {[-0.25, -0.1, -0.03, 0.03, 0.1, 0.25].map((x) => (
                <span key={x}>
                  <i
                    className="mr-1 inline-block size-2.5 rounded-[2px] align-[-1px]"
                    style={{ background: leanFill(x) }}
                  />
                  {leanLabel(x)}
                </span>
              ))}
              <span className="w-full text-el-muted">
                Boundaries are illustrative.
              </span>
            </figcaption>
          </figure>
          <div>
            <h3 className={LABEL}>Constituencies in order of lean</h3>
            <p className="mt-1 text-el-muted text-xs">
              The rule above the eighth marks the median seat: a party that wins
              it and every seat on its side has a majority. Squares show the
              2022 winner.
            </p>
            <ol className="mt-2">
              {ladder.map((code, i) => {
                const winner = results.results["2022"]?.[code]?.c[0]?.[1] ?? "";
                const x = (v: number) =>
                  Math.max(0, Math.min(1, (v + 0.3) / 0.6)) * 100;
                return (
                  <li
                    className={`flex items-center gap-2 py-1 text-sm ${i === 7 ? "border-el-ink border-t-2" : ""}`}
                    key={code}
                  >
                    <SeatSquare
                      className="size-6 shrink-0"
                      code={code}
                      label={`2022 winner: ${winner}`}
                      party={winner}
                    />
                    <Link
                      className="w-40 shrink-0 truncate hover:underline"
                      href={constituencyHref(results, code)}
                    >
                      {constituencyName(results, code)}
                    </Link>
                    <span className="relative h-2 flex-1 bg-el-paper-2">
                      <span
                        className="absolute inset-y-0"
                        style={{
                          left: `${Math.min(x(0), x(lean[code]))}%`,
                          width: `${Math.abs(x(lean[code]) - x(0))}%`,
                          background: leanFill(lean[code] * 2),
                        }}
                      />
                      <span className="absolute inset-y-[-3px] left-1/2 w-px bg-el-ink" />
                    </span>
                    <span className="w-16 shrink-0 text-right font-semibold tabular-nums">
                      {leanLabel(lean[code])}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <figure>
            <FlatMap
              geo={geo}
              label="Lean of each polling division"
              level="div"
              regions={Object.keys(geo.divisions).map((division) => {
                const d = divisionLean[division];
                return {
                  code: division,
                  fill: d ? leanFill(d.lean) : "var(--el-land)",
                  title: d
                    ? `${division}${d.place ? ` · ${d.place}` : ""}: ${leanLabel(d.lean)}${d.only2022 ? " (2022 only)" : ""}`
                    : `${division}: no result`,
                };
              })}
            />
            <figcaption className="mt-2 text-el-muted text-xs">
              Polling divisions, 2022 and 2018. Divisions created after 2018 use
              2022 only.
            </figcaption>
          </figure>
          <div>
            <h3 className={LABEL}>Polling divisions closest to even</h3>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-el-ink border-b text-left">
                  <th className="py-1.5 font-semibold" scope="col">
                    Division
                  </th>
                  <th className="py-1.5 font-semibold" scope="col">
                    Constituency
                  </th>
                  <th className="py-1.5 text-right font-semibold" scope="col">
                    Lean
                  </th>
                </tr>
              </thead>
              <tbody>
                {closestDivisions.map((d) => (
                  <tr className="border-el-rule border-b" key={d.division}>
                    <td className="py-1.5">
                      <b>{d.division}</b> {d.place}
                    </td>
                    <td className="py-1.5">
                      {constituencyShortName(results, d.code)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {leanLabel(d.lean)}
                      {d.only2022 && (
                        <span className="text-el-muted text-xs"> 2022</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section
        id="forecast"
        intro="Each seat is rated by its chance of going NDC, NNP or DPM if the national vote is at the level you set, allowing for how much seats usually differ from the national swing. This follows the Cook Political Report and Sabato’s Crystal Ball, but calculated rather than judged."
        title="2 · Seat ratings and the range of outcomes"
      >
        <Forecast
          df={sp.df}
          inputs={inputs}
          seats={seats}
          sL={sp.sL}
          sN={sp.sN}
        />
      </Section>

      <Section
        id="backtest"
        intro="The same method run from each past election to the next, without using the result it was predicting. Each bar is the 80% range of NDC seats the method gave; the dot is what happened. Seats are counted by who led between the NDC and the NNP."
        title="3 · Would this have worked before?"
      >
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            [
              "Result inside the 80% range",
              `${inside} of ${rows.length}`,
              "elections, 1995–2022",
            ],
            [
              "Seats called correctly",
              `${called} of ${calibration.length}`,
              "when the national vote is known",
            ],
            [
              "Brier score",
              brier.toFixed(3),
              "lower is better; a coin flip scores 0.250",
            ],
          ].map(([label, value, note]) => (
            <div key={label}>
              <dt className={LABEL}>{label}</dt>
              <dd className="mt-0.5 font-semibold text-xl tabular-nums">
                {value}
              </dd>
              <dd className="text-el-muted text-xs">{note}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <figure>
            <svg
              aria-label="Predicted range of NDC seats and the actual result for each election"
              className="h-auto w-full"
              role="img"
              viewBox={`0 0 560 ${rows.length * 30 + 34}`}
            >
              {[0, 4, 8, 12, 15].map((k) => {
                const x = 90 + (k / 15) * 454;
                return (
                  <g key={k}>
                    <line
                      stroke="var(--el-rule)"
                      x1={x}
                      x2={x}
                      y1={16}
                      y2={rows.length * 30 + 26}
                    />
                    <text
                      className="fill-(--el-muted) text-[11px]"
                      textAnchor="middle"
                      x={x}
                      y={12}
                    >
                      {k}
                    </text>
                  </g>
                );
              })}
              {rows.map((r, i) => {
                const x = (k: number) => 90 + (k / 15) * 454;
                const cy = 34 + i * 30;
                return (
                  <g key={r.to}>
                    <text
                      className="fill-(--el-ink) text-[12px]"
                      x={0}
                      y={cy + 4}
                    >
                      {r.from} → {r.to}
                    </text>
                    <rect
                      fill="var(--el-paper-2)"
                      height={12}
                      rx={6}
                      stroke="var(--el-rule-2)"
                      width={x(r.hi) - x(r.lo) + 8}
                      x={x(r.lo) - 4}
                      y={cy - 6}
                    />
                    <circle
                      cx={x(r.actual)}
                      cy={cy}
                      fill={partyColor(r.actual >= 8 ? "NDC" : "NNP")}
                      r={6.5}
                      stroke="var(--el-paper)"
                      strokeWidth={1.5}
                    >
                      <title>{`${r.to}: predicted NDC ${r.lo}–${r.hi}; NDC led in ${r.actual}; ${r.right} of 15 seats called with the national vote known`}</title>
                    </circle>
                  </g>
                );
              })}
            </svg>
            <figcaption className="text-el-muted text-xs">
              NDC seats, by who led between the NDC and the NNP (in 1995 the
              GULP also won 2 seats). Each prediction uses swing sizes from the
              other elections only.
            </figcaption>
          </figure>
          <div>
            <h3 className={LABEL}>Are the seat chances honest?</h3>
            <p className="mt-1 text-el-muted text-xs">
              If well calibrated, seats given about 70% should go NDC about 70%
              of the time.
            </p>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-el-ink border-b text-left">
                  <th className="py-1.5 font-semibold" scope="col">
                    NDC chance
                  </th>
                  <th className="py-1.5 text-right font-semibold" scope="col">
                    Seats
                  </th>
                  <th className="py-1.5 text-right font-semibold" scope="col">
                    Average
                  </th>
                  <th className="py-1.5 text-right font-semibold" scope="col">
                    NDC led
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  [0, 0.1],
                  [0.1, 0.3],
                  [0.3, 0.5],
                  [0.5, 0.7],
                  [0.7, 0.9],
                  [0.9, 1.01],
                ].map(([a = 0, b = 1]) => {
                  const s = calibration.filter((r) => r.p >= a && r.p < b);
                  if (!s.length) return null;
                  const avg = s.reduce((q, r) => q + r.p, 0) / s.length;
                  const won = s.filter((r) => r.won).length / s.length;
                  return (
                    <tr className="border-el-rule border-b" key={a}>
                      <td className="py-1.5">
                        {Math.round(a * 100)}–
                        {Math.min(100, Math.round(b * 100))}%
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {s.length}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {pct(avg, 0)}
                      </td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">
                        {pct(won, 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section id="your-map" title="4 · Make your own map">
        <Link
          className="flex flex-wrap items-center justify-between gap-4 border border-el-rule bg-el-paper-2 p-5 hover:border-el-ink"
          href="/make-your-map"
        >
          <span>
            <b className="block font-bold font-serif text-xl">
              Make your map →
            </b>
            <span className="text-el-ink-2 text-sm">
              Rate every constituency from Solid NDC to Solid NNP (and DPM where
              it stands), starting from these ratings, and share your map.
            </span>
          </span>
        </Link>
      </Section>

      <Section
        id="polls"
        intro="Every published Grenada poll we could find with party figures, compared with the result that followed. Shares are of all respondents, as published; the comparison uses each party’s share of the NDC–NNP vote."
        title="5 · Polls"
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <figure>
            <h3 className={LABEL}>How the polls did</h3>
            <p className="mt-1 text-el-muted text-xs">
              Open dot: the poll’s NDC share of the NDC–NNP vote. Filled dot:
              the result.
            </p>
            <svg
              aria-label="Poll estimates of the NDC share against results"
              className="mt-2 h-auto w-full"
              role="img"
              viewBox={`0 0 560 ${scored.length * 40 + 40}`}
            >
              {[0.3, 0.4, 0.5, 0.6].map((v) => {
                const x = 150 + ((v - 0.25) / 0.35) * 390;
                return (
                  <g key={v}>
                    <line
                      stroke="var(--el-rule)"
                      x1={x}
                      x2={x}
                      y1={18}
                      y2={scored.length * 40 + 30}
                    />
                    <text
                      className="fill-(--el-muted) text-[11px]"
                      textAnchor="middle"
                      x={x}
                      y={12}
                    >
                      {v * 100}%
                    </text>
                  </g>
                );
              })}
              {scored.map(({ poll, score }, i) => {
                const x = (v: number) => 150 + ((v - 0.25) / 0.35) * 390;
                const cy = 40 + i * 40;
                return (
                  <g key={poll.id}>
                    <text
                      className="fill-(--el-ink) text-[12px]"
                      x={0}
                      y={cy - 2}
                    >
                      {poll.pollster}
                    </text>
                    <text
                      className="fill-(--el-muted) text-[11px]"
                      x={0}
                      y={cy + 13}
                    >
                      {poll.field} → {poll.target}
                    </text>
                    <line
                      stroke="var(--el-ink-2)"
                      strokeWidth={2}
                      x1={x(score.estimate)}
                      x2={x(score.actual)}
                      y1={cy}
                      y2={cy}
                    />
                    <circle
                      cx={x(score.estimate)}
                      cy={cy}
                      fill="var(--el-paper)"
                      r={6}
                      stroke={partyColor("NDC")}
                      strokeWidth={2.5}
                    />
                    <circle
                      cx={x(score.actual)}
                      cy={cy}
                      fill={partyColor("NDC")}
                      r={6.5}
                    />
                    <text
                      className="fill-(--el-ink-2) text-[11px]"
                      textAnchor="middle"
                      x={(x(score.estimate) + x(score.actual)) / 2}
                      y={cy - 9}
                    >
                      {(score.error * 100).toFixed(1)}
                    </text>
                    <title>{`${poll.pollster}, ${poll.field}: poll ${pct(score.estimate)}, result ${pct(score.actual)}`}</title>
                  </g>
                );
              })}
            </svg>
            <p className="mt-2 font-serif text-el-ink-2 text-lg leading-normal">
              All {scored.length} polls we can check <b>understated the NDC</b>,
              by {Math.abs(meanError * 100).toFixed(1)} points on average. Only
              two pollsters and two elections are involved, so this is a
              warning, not a correction factor. DPB Global’s estimated party
              bases imply about <b>{pct(dpbShare, 0)}</b> for the NDC in the
              NDC–NNP vote
              <Flag
                note="Only estimated party bases were published; the poll is under scrutiny."
                status="check"
              />
              .
            </p>
          </figure>
          <div>
            <h3 className={LABEL}>What we still need</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
              {STILL_NEEDED.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">
              All published polls and projections
            </caption>
            <thead>
              <tr className="border-el-ink border-b text-left">
                {[
                  "Pollster",
                  "Fieldwork",
                  "Published",
                  "Sample",
                  "NNP",
                  "NDC",
                  "Notes",
                  "Source",
                ].map((h) => (
                  <th
                    className={`py-1.5 pr-3 font-semibold ${["Sample", "NNP", "NDC"].includes(h) ? "text-right" : ""}`}
                    key={h}
                    scope="col"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...campaign.polls].reverse().map((p) => {
                const share = (k: "NNP" | "NDC") => {
                  if (p[k] != null) return `${p[k]}%`;
                  const seats = p.seats?.[k];
                  return seats == null ? "–" : `${seats} seats`;
                };
                return (
                  <tr className="border-el-rule border-b align-top" key={p.id}>
                    <td className="py-2 pr-3 font-semibold">
                      {p.pollster}
                      <Flag note={p.note} status={p.flag} />
                    </td>
                    <td className="py-2 pr-3">{p.field}</td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      {p.pub ? formatIsoDate(p.pub) : "–"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {p.n ? fmt(p.n) : "Not stated"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {share("NNP")}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {share("NDC")}
                    </td>
                    <td className="py-2 pr-3 text-el-ink-2">{p.note}</td>
                    <td className="py-2 pr-3 text-xs">
                      <SourceLink id={p.src} sources={campaign.sources} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="log" title="Changes to the model">
        <ol className="divide-y divide-el-rule border-el-rule border-y text-sm">
          {CHANGE_LOG.map((c) => (
            <li
              className="grid gap-1 py-3 sm:grid-cols-[10rem_14rem_1fr]"
              key={c.what}
            >
              <span className="text-el-muted">{c.date}</span>
              <b className="font-semibold">{c.what}</b>
              <span className="text-el-ink-2">{c.why}</span>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}
