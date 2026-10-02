import type { Metadata } from "next";
import Link from "next/link";
import {
  SwingCalculator,
  type SwingYear,
} from "@/components/how-close/swing-calculator";
import { FlatMap, ringPath } from "@/components/map/flat-map";
import { PageHead, Section } from "@/components/section";
import {
  type EventDivision,
  eventDivisions,
  eventNational,
  eventResult,
  eventSlug,
} from "@/data/events";
import { data, geo, results } from "@/data/load";
import { CODES, constituencyName, EVENTS, MAPPED_YEARS } from "@/data/model";
import { partyColor, partyInfo } from "@/data/parties";
import {
  gallagher,
  type ResultQuality,
  resultQuality,
  swingSeat,
} from "@/data/swing";
import { fmt, pct } from "@/lib/format";

export const metadata: Metadata = {
  title: "How close was it?",
  description:
    "A swing calculator for every Grenada election since 1990, where the votes moved in each polling division, votes against seats, and how far each result can be trusted.",
};

const LABEL =
  "font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]";

function ndcShare(d: {
  c: [string, string, number, unknown?][];
}): number | null {
  const a = d.c.find((r) => r[1] === "NDC")?.[2] ?? 0;
  const b = d.c.find((r) => r[1] === "NNP")?.[2] ?? 0;
  return a + b ? a / (a + b) : null;
}

function swingFill(points: number): string {
  const x = Math.max(-1, Math.min(1, points / 15));
  return `color-mix(in oklab, var(--el-${x >= 0 ? "ndc" : "nnp"}) ${Math.round(Math.abs(x) * 100)}%, var(--el-div-mid))`;
}

function DivisionSwing({ from, to }: { from: string; to: string }) {
  const before = Object.fromEntries(
    eventDivisions(data, from).map((d) => [d.division, d])
  );
  const rows = eventDivisions(data, to)
    .map((d) => {
      const prev = before[d.division];
      const a = prev ? ndcShare(prev) : null;
      const b = ndcShare(d);
      return a != null && b != null ? { d, swing: (b - a) * 100 } : null;
    })
    .filter((r): r is { d: EventDivision; swing: number } => r !== null);
  const sorted = [...rows].sort((p, q) => p.swing - q.swing);
  const median = sorted[Math.floor(sorted.length / 2)]?.swing ?? 0;
  const toNdc = rows.filter((r) => r.swing > 0).length;
  const bySwing = Object.fromEntries(rows.map((r) => [r.d.division, r.swing]));
  const W = 560;
  const x = (v: number) =>
    20 + ((Math.max(-30, Math.min(30, v)) + 30) / 60) * (W - 40);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <figure>
        <FlatMap
          geo={geo}
          label={`Swing in each polling division, ${from} to ${to}`}
          level="div"
          regions={Object.keys(geo.divisions).map((code) => {
            const s = bySwing[code];
            return {
              code,
              fill: s == null ? "var(--el-paper-2)" : swingFill(s),
              title:
                s == null
                  ? `${code}: not comparable`
                  : `${code}: ${s >= 0 ? "+" : ""}${s.toFixed(1)} pts toward the ${s >= 0 ? "NDC" : "NNP"}`,
            };
          })}
        />
        <figcaption className="mt-2 text-el-muted text-xs">
          Gold: toward the NDC. Green: toward the NNP. Grey: no comparable
          result. Boundaries are illustrative.
        </figcaption>
      </figure>
      <div>
        <dl className="grid grid-cols-3 gap-3">
          <div>
            <dt className={LABEL}>Divisions compared</dt>
            <dd className="font-semibold text-xl tabular-nums">
              {rows.length}
            </dd>
          </div>
          <div>
            <dt className={LABEL}>Toward the NDC</dt>
            <dd className="font-semibold text-xl tabular-nums">{toNdc}</dd>
            <dd className="text-el-muted text-xs">
              {rows.length - toNdc} toward the NNP
            </dd>
          </div>
          <div>
            <dt className={LABEL}>Median swing</dt>
            <dd className="font-semibold text-xl tabular-nums">
              {median >= 0 ? "+" : ""}
              {median.toFixed(1)}
            </dd>
            <dd className="text-el-muted text-xs">
              points toward the {median >= 0 ? "NDC" : "NNP"}
            </dd>
          </div>
        </dl>
        <svg
          aria-label={`Swing in each polling division, ${from} to ${to}, one dot per division`}
          className="mt-4 h-auto w-full"
          role="img"
          viewBox={`0 0 ${W} 90`}
        >
          <line
            stroke="var(--el-ink)"
            strokeDasharray="3 3"
            x1={x(0)}
            x2={x(0)}
            y1={4}
            y2={70}
          />
          {sorted.map((r, i) => (
            <circle
              cx={x(r.swing)}
              cy={14 + (i % 7) * 8}
              fill={swingFill(r.swing)}
              key={r.d.division}
              r={3.5}
              stroke="var(--el-paper)"
              strokeWidth={0.8}
            >
              <title>{`${r.d.division}${r.d.places[0] ? ` · ${r.d.places[0]}` : ""}: ${r.swing >= 0 ? "+" : ""}${r.swing.toFixed(1)}`}</title>
            </circle>
          ))}
          {[-30, -15, 0, 15, 30].map((v) => (
            <text
              className="fill-(--el-muted) text-[10px]"
              key={v}
              textAnchor="middle"
              x={x(v)}
              y={86}
            >
              {v > 0 ? `+${v}` : v}
            </text>
          ))}
        </svg>
        <p className="text-el-muted text-xs">
          Change in the NDC’s share of the two-party vote, in points. Values
          beyond ±30 sit at the edge.
        </p>
      </div>
    </div>
  );
}

const QUALITY: Record<
  ResultQuality,
  { label: string; bg: string; fg: string; mark: string }
> = {
  official: {
    label: "Official record",
    bg: "var(--el-seq-1)",
    fg: "#fff",
    mark: "",
  },
  corroborated: {
    label: "Corroborated †",
    bg: "color-mix(in oklab, var(--el-seq-1) 55%, var(--el-seq-0))",
    fg: "#121314",
    mark: "†",
  },
  partly: {
    label: "Winner official, others ✱",
    bg: "var(--el-seq-0)",
    fg: "#121314",
    mark: "✱",
  },
  unverified: {
    label: "Secondary only ✱",
    bg: "var(--el-paper-2)",
    fg: "var(--el-ink-2)",
    mark: "✱",
  },
  conflict: {
    label: "Official copies conflict ✱✱",
    bg: "var(--el-paper)",
    fg: "var(--el-ink)",
    mark: "✱✱",
  },
  none: {
    label: "No result",
    bg: "transparent",
    fg: "var(--el-muted)",
    mark: "–",
  },
};

export default function HowClosePage() {
  const swingYears: SwingYear[] = MAPPED_YEARS.filter((y) => y >= 1990).map(
    (y) => ({
      year: String(y),
      seats: CODES.flatMap((c) => {
        const r = eventResult(data, String(y), c);
        return r ? [swingSeat(c, r.c)] : [];
      }),
    })
  );
  const shapes = Object.fromEntries(
    CODES.map((c) => [
      c,
      {
        d: ringPath(geo.constituencies[c].rings),
        name: constituencyName(results, c),
      },
    ])
  );

  const knifeEdge = ["2013", "2018", "2022"]
    .flatMap((y) =>
      eventDivisions(data, y).map((d) => {
        const a = d.c.find((r) => r[1] === "NDC")?.[2] ?? 0;
        const b = d.c.find((r) => r[1] === "NNP")?.[2] ?? 0;
        return { y, d, a, b, gap: Math.abs(a - b) };
      })
    )
    .filter((r) => r.a + r.b > 0)
    .sort((p, q) => p.gap - q.gap)
    .slice(0, 12);

  const general = EVENTS.filter((e) => e.kind === "general" && e.map);
  const votesSeats = general.map((e) => {
    const n = eventNational(data, e.id);
    const [party = "", seats = 0] =
      Object.entries(n.seats).sort((a, b) => b[1] - a[1])[0] ?? [];
    return {
      year: e.year,
      id: e.id,
      party,
      vote: (n.votes[party] ?? 0) / n.total,
      seat: seats / 15,
      sweep: seats === 15,
      gallagher: gallagher(n.votes, n.seats, 15),
    };
  });

  const scatter = (id: string) =>
    eventDivisions(data, id).flatMap((d) => {
      const [w, r] = d.c;
      const valid = d.c.reduce((a, x) => a + x[2], 0);
      if (!(w && r && d.registered && valid)) return [];
      return [
        {
          d,
          turnout: d.cast / d.registered,
          margin: (w[2] - r[2]) / valid,
          party: w[1],
        },
      ];
    });

  const refPairs = [
    {
      ref: "2016r",
      general: "2013",
      label: "2016 referendum vs 2013 election",
    },
    {
      ref: "2018r",
      general: "2018",
      label: "2018 referendum vs 2018 election",
    },
  ].map((p) => {
    const g = Object.fromEntries(
      eventDivisions(data, p.general).map((d) => [d.division, d])
    );
    const points = eventDivisions(data, p.ref).flatMap((d) => {
      const yes = d.c.find((r) => r[1] === "YES")?.[2] ?? 0;
      const no = d.c.find((r) => r[1] === "NO")?.[2] ?? 0;
      const gd = g[d.division];
      const ndc = gd ? ndcShare(gd) : null;
      return yes + no && ndc != null ? [{ d, yes: yes / (yes + no), ndc }] : [];
    });
    return { ...p, points };
  });

  const qualityYears = EVENTS.filter((e) => e.kind === "general");

  return (
    <>
      <PageHead
        deck="Grenada elects 15 members by first past the post, so small shifts in votes can change a government. These tools show how close each election was, where votes moved, and how far each result can be trusted."
        eyebrow="Analysis"
        title="How close was it?"
      />

      <Section
        id="swing"
        intro="Move votes between the NDC and the NNP by the same number of points in every constituency (a uniform swing) and see which seats change hands. Other parties’ votes stay as they were. Elections from 1990, when both parties first stood."
        title="1 · Swing calculator"
      >
        <SwingCalculator
          inset={geo.inset}
          land={ringPath(geo.land)}
          shapes={shapes}
          years={swingYears}
        />
      </Section>

      <Section
        id="moved"
        intro="Every polling division’s change in the NDC’s share of the two-party vote."
        title="2 · Where the votes moved"
      >
        <h3 className="mb-3 font-bold text-lg">2018 → 2022</h3>
        <DivisionSwing from="2018" to="2022" />
        <h3 className="mt-10 mb-3 font-bold text-lg">2013 → 2018</h3>
        <DivisionSwing from="2013" to="2018" />
        <h3 className={`${LABEL} mt-10`}>Knife-edge divisions</h3>
        <p className="text-el-muted text-xs">
          The closest NDC–NNP contests in any polling division, 2013–2022
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-el-ink border-b text-left">
                {["Election", "Division", "NDC", "NNP", "Gap"].map((h, i) => (
                  <th
                    className={`py-1.5 pr-3 font-semibold ${i > 1 ? "text-right" : ""}`}
                    key={h}
                    scope="col"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {knifeEdge.map((r) => (
                <tr
                  className="border-el-rule border-b"
                  key={`${r.y}${r.d.division}`}
                >
                  <td className="py-1.5 pr-3">
                    <Link
                      className="hover:underline"
                      href={`/elections/${r.y}#${r.d.code}`}
                    >
                      {r.y}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3">
                    <b>{r.d.division}</b> {r.d.places[0]}
                    <span className="block text-el-muted text-xs">
                      {constituencyName(results, r.d.code)}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {fmt(r.a)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {fmt(r.b)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">
                    {r.gap}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="seats"
        intro="Under first past the post, the winning party’s share of seats usually runs far ahead of its share of votes. Three times since 1999 one party has won every seat."
        title="3 · Votes versus seats"
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <figure>
            <svg
              aria-label="Vote share and seat share of the winning party at each election"
              className="h-auto w-full"
              role="img"
              viewBox={`0 0 560 ${votesSeats.length * 28 + 40}`}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((v) => {
                const x = 54 + v * 488;
                return (
                  <g key={v}>
                    <line
                      stroke="var(--el-rule)"
                      x1={x}
                      x2={x}
                      y1={16}
                      y2={votesSeats.length * 28 + 28}
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
              {votesSeats.map((r, i) => {
                const cy = 34 + i * 28;
                const x = (v: number) => 54 + v * 488;
                return (
                  <g key={r.id}>
                    <text
                      className="fill-(--el-ink) text-[12px]"
                      textAnchor="end"
                      x={44}
                      y={cy + 4}
                    >
                      {r.year}
                    </text>
                    <line
                      stroke={partyColor(r.party)}
                      strokeWidth={3}
                      x1={x(r.vote)}
                      x2={x(r.seat)}
                      y1={cy}
                      y2={cy}
                    />
                    <circle
                      cx={x(r.vote)}
                      cy={cy}
                      fill="var(--el-paper)"
                      r={6}
                      stroke={partyColor(r.party)}
                      strokeWidth={2.5}
                    />
                    <circle
                      cx={x(r.seat)}
                      cy={cy}
                      fill={partyColor(r.party)}
                      r={6.5}
                    />
                    <text
                      className="fill-(--el-ink-2) text-[11px]"
                      x={Math.min(x(Math.max(r.vote, r.seat)) + 12, 480)}
                      y={cy + 4}
                    >
                      {r.party}
                      {r.sweep ? " · clean sweep" : ""}
                    </text>
                    <title>{`${r.year}, ${partyInfo(r.party).name}: ${pct(r.vote)} of the vote, ${pct(r.seat, 0)} of the seats`}</title>
                  </g>
                );
              })}
            </svg>
            <figcaption className="text-el-muted text-xs">
              Hollow dot: vote share. Filled dot: seat share. 1976 votes are
              from a secondary source.
            </figcaption>
          </figure>
          <div>
            <h3 className={LABEL}>How unequal the result was</h3>
            <p className="text-el-muted text-xs">
              Gallagher disproportionality index (0 means seats exactly match
              votes). Above about 15 is very high internationally.
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {votesSeats.map((r) => (
                <li className="flex items-center gap-2" key={r.id}>
                  <span className="w-10 tabular-nums">{r.year}</span>
                  <span className="h-3 flex-1 bg-el-paper-2">
                    <span
                      className="block h-full bg-el-ink-2"
                      style={{
                        width: `${Math.min(100, (r.gallagher / 50) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="w-10 text-right tabular-nums">
                    {r.gallagher.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section
        id="turnout"
        intro="Each dot is a polling division: its turnout against its winning margin."
        title="4 · Do close contests bring out voters?"
      >
        <div className="grid gap-6 md:grid-cols-3">
          {["2013", "2018", "2022"].map((id) => {
            const pts = scatter(id);
            const W = 300;
            const H = 220;
            const x = (m: number) => 30 + Math.min(1, m / 0.8) * (W - 40);
            const y = (t: number) =>
              H - 24 - Math.max(0, Math.min(1, (t - 0.4) / 0.6)) * (H - 40);
            return (
              <figure key={id}>
                <figcaption className="font-semibold text-sm">{id}</figcaption>
                <svg
                  aria-label={`Turnout against winning margin by polling division, ${id}`}
                  className="h-auto w-full"
                  role="img"
                  viewBox={`0 0 ${W} ${H}`}
                >
                  {[0.4, 0.6, 0.8, 1].map((t) => (
                    <text
                      className="fill-(--el-muted) text-[9px]"
                      key={t}
                      x={0}
                      y={y(t) + 3}
                    >
                      {t * 100}%
                    </text>
                  ))}
                  {[0, 0.4, 0.8].map((m) => (
                    <text
                      className="fill-(--el-muted) text-[9px]"
                      key={m}
                      textAnchor="middle"
                      x={x(m)}
                      y={H - 6}
                    >
                      {m * 100}
                    </text>
                  ))}
                  {pts.map((p) => (
                    <circle
                      cx={x(p.margin)}
                      cy={y(p.turnout)}
                      fill={partyColor(p.party)}
                      fillOpacity={0.75}
                      key={p.d.division}
                      r={3}
                    >
                      <title>{`${p.d.division}: turnout ${pct(p.turnout)}, margin ${(p.margin * 100).toFixed(0)} pts (${p.party})`}</title>
                    </circle>
                  ))}
                </svg>
              </figure>
            );
          })}
        </div>
        <p className="mt-1 text-el-muted text-xs">
          Across: winning margin in points. Up: turnout. Colour: the division’s
          winner.
        </p>
      </Section>

      <Section
        id="referendums"
        intro="Each dot is a polling division: the Yes share in a referendum against the NDC’s share of the two-party vote at the nearest general election."
        title="5 · Did referendums follow party lines?"
      >
        <div className="grid gap-6 md:grid-cols-2">
          {refPairs.map((p) => {
            const W = 320;
            const H = 240;
            const x = (v: number) => 30 + v * (W - 40);
            const y = (v: number) => H - 24 - v * (H - 40);
            return (
              <figure key={p.ref}>
                <figcaption className="font-semibold text-sm">
                  {p.label}
                </figcaption>
                <svg
                  aria-label={p.label}
                  className="h-auto w-full"
                  role="img"
                  viewBox={`0 0 ${W} ${H}`}
                >
                  <line
                    stroke="var(--el-rule)"
                    x1={x(0.5)}
                    x2={x(0.5)}
                    y1={y(0)}
                    y2={y(1)}
                  />
                  <line
                    stroke="var(--el-rule)"
                    x1={x(0)}
                    x2={x(1)}
                    y1={y(0.5)}
                    y2={y(0.5)}
                  />
                  {p.points.map((q) => (
                    <circle
                      cx={x(q.ndc)}
                      cy={y(q.yes)}
                      fill={partyColor(q.yes > 0.5 ? "YES" : "NO")}
                      fillOpacity={0.75}
                      key={q.d.division}
                      r={3}
                    >
                      <title>{`${q.d.division}: Yes ${pct(q.yes)}, NDC ${pct(q.ndc)} of the two-party vote`}</title>
                    </circle>
                  ))}
                  <text
                    className="fill-(--el-muted) text-[9px]"
                    textAnchor="middle"
                    x={x(0.5)}
                    y={H - 6}
                  >
                    NDC two-party share →
                  </text>
                  <text className="fill-(--el-muted) text-[9px]" x={2} y={12}>
                    Yes ↑
                  </text>
                </svg>
              </figure>
            );
          })}
        </div>
        <p className="mt-1 text-el-muted text-xs">
          The 2018 referendum has divisions only for the 10 constituencies
          readable in the Gazette.
        </p>
      </Section>

      <Section
        id="trust"
        intro={
          <>
            Every general election in every constituency, coloured by how its
            figures were verified. Details are on the{" "}
            <Link className="underline underline-offset-2" href="/sources">
              Sources
            </Link>{" "}
            page.
          </>
        }
        title="6 · How far each result can be trusted"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-[2px] text-[11px]">
            <thead>
              <tr>
                <th className="text-left font-semibold" scope="col">
                  Constituency
                </th>
                {qualityYears.map((e) => (
                  <th
                    className="font-semibold tabular-nums"
                    key={e.id}
                    scope="col"
                  >
                    <Link
                      className="hover:underline"
                      href={`/elections/${eventSlug(e.id)}`}
                    >
                      ’{String(e.year).slice(2)}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className="pr-2 text-left font-normal" scope="row">
                  Before 1972 (8–10 seats, old boundaries)
                </th>
                {qualityYears.map((e) => {
                  if (e.map) return <td key={e.id} />;
                  const q = resultQuality(
                    (results.early[e.id] ?? []).flatMap((r) => r.c)
                  );
                  return (
                    <td
                      className="h-6 rounded-[2px] text-center"
                      key={e.id}
                      style={{
                        background: QUALITY[q].bg,
                        color: QUALITY[q].fg,
                      }}
                      title={`${e.year}: ${QUALITY[q].label}`}
                    >
                      {QUALITY[q].mark}
                    </td>
                  );
                })}
              </tr>
              {CODES.map((code) => (
                <tr key={code}>
                  <th className="pr-2 text-left font-normal" scope="row">
                    {constituencyName(results, code)}
                  </th>
                  {qualityYears.map((e) => {
                    if (!e.map) return <td key={e.id} />;
                    const r = eventResult(data, e.id, code);
                    const q = r ? resultQuality(r.c) : "none";
                    return (
                      <td
                        className="h-6 rounded-[2px] text-center"
                        key={e.id}
                        style={{
                          background: QUALITY[q].bg,
                          color: QUALITY[q].fg,
                        }}
                        title={`${e.year}, ${constituencyName(results, code)}: ${QUALITY[q].label}`}
                      >
                        {QUALITY[q].mark}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {(Object.keys(QUALITY) as ResultQuality[]).map((q) => (
            <li className="flex items-center gap-1.5" key={q}>
              <i
                className="inline-block size-3 rounded-[2px] border border-el-rule"
                style={{ background: QUALITY[q].bg }}
              />
              {QUALITY[q].label}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
