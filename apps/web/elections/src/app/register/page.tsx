import type { Metadata } from "next";
import Link from "next/link";
import { CalculationNote, EvidenceCitation } from "@/components/learn/evidence";
import { FlatMap } from "@/components/map/flat-map";
import { PageHead, Section } from "@/components/section";
import { geo, register, results } from "@/data/load";
import { CODES, constituencyHref, constituencyName } from "@/data/model";
import {
  addendumTotals,
  divisionGrowth,
  rollChecks,
  snapshotTotals,
} from "@/data/register";
import { fmt, formatIsoDate, pct } from "@/lib/format";

export const metadata: Metadata = {
  title: "Voter register",
  description:
    "How Grenada’s electoral roll has changed since 2019, counted from the Parliamentary Elections Office’s published lists. Totals only, no personal details.",
};

const LABEL =
  "font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]";

/** Growth fill: none or negative is pale, +20% or more is the full sequential colour. */
function growthFill(change: number): string {
  const t = Math.max(0, Math.min(1, change / 0.2));
  return `color-mix(in oklab, var(--el-seq-1) ${Math.round(8 + 92 * t)}%, var(--el-seq-0))`;
}

export default function RegisterPage() {
  const lists = snapshotTotals(register);
  const adds = addendumTotals(register);
  const checks = rollChecks(register);
  const growth = divisionGrowth(register);
  const first = lists[0];
  const last = lists.at(-1);
  if (!(first && last)) return null;

  const W = 560;
  const H = 200;
  const minE = Math.min(...lists.map((l) => l.electors)) * 0.97;
  const maxE = Math.max(...lists.map((l) => l.electors)) * 1.01;
  const t0 = Date.parse(first.date);
  const t1 = Date.parse(last.date);
  const x = (d: string) => 44 + ((Date.parse(d) - t0) / (t1 - t0)) * (W - 60);
  const y = (v: number) => H - 26 - ((v - minE) / (maxE - minE)) * (H - 44);
  const maxAdd = Math.max(...adds.map((a) => a.added));

  const byCode = CODES.map((code) => {
    const rows = growth.filter((g) => g.division.startsWith(code));
    const a = rows.reduce((s, r) => s + r.first, 0);
    const b = rows.reduce((s, r) => s + r.last, 0);
    return {
      code,
      divisions: rows.length,
      first: a,
      last: b,
      change: a ? (b - a) / a : 0,
    };
  }).sort((p, q) => q.change - p.change);

  return (
    <>
      <PageHead
        deck="The Parliamentary Elections Office publishes the full list of electors, with names and addresses, every six months. This page uses only totals counted from those lists and shows no individual’s details."
        eyebrow={`Voter register · ${first.date.slice(0, 4)} to ${last.date.slice(0, 4)}`}
        learning="register"
        title="Who is on Grenada’s electoral roll"
      >
        <dl className="mt-6 grid grid-cols-2 gap-4 border-el-rule border-t pt-4 lg:grid-cols-4">
          {[
            [
              "Electors now",
              fmt(last.electors),
              `Consolidated list, ${formatIsoDate(last.date)}`,
            ],
            [
              "Change since 2019",
              pct((last.electors - first.electors) / first.electors),
              `from ${fmt(first.electors)}`,
            ],
            [
              "Women",
              pct(last.female / (last.male + last.female)),
              "of electors with sex recorded",
            ],
            [
              "New registrations",
              fmt(adds.reduce((a, b) => a + b.added, 0)),
              `in ${adds.length} quarterly addenda`,
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
        id="size"
        intro="Electors on each consolidated list. The dashed line marks the list used for the 23 June 2022 election (10 June 2022)."
        title="Registered electors"
      >
        <CalculationNote formula="Snapshot total = sum of included non-police list entries. Relative change = (later − earlier) ÷ earlier. The chart’s vertical axis does not start at zero.">
          <p className="mt-2">
            A rise or fall is not an explanation: transfers, removals and
            changes in coverage need separate evidence.
          </p>
        </CalculationNote>
        <svg
          aria-label="Electors on each consolidated list"
          className="h-auto w-full max-w-3xl"
          role="img"
          viewBox={`0 0 ${W} ${H}`}
        >
          {[0, 0.5, 1].map((f) => {
            const v = minE + f * (maxE - minE);
            return (
              <g key={f}>
                <line
                  stroke="var(--el-rule)"
                  x1={44}
                  x2={W - 10}
                  y1={y(v)}
                  y2={y(v)}
                />
                <text
                  className="fill-(--el-muted) text-[10px] max-sm:text-[16px]"
                  x={0}
                  y={y(v) + 3}
                >
                  {fmt(v)}
                </text>
              </g>
            );
          })}
          <line
            stroke="var(--el-ink)"
            strokeDasharray="3 3"
            x1={x("2022-06-10")}
            x2={x("2022-06-10")}
            y1={10}
            y2={H - 26}
          />
          <polyline
            fill="none"
            points={lists.map((l) => `${x(l.date)},${y(l.electors)}`).join(" ")}
            stroke="var(--el-seq-1)"
            strokeWidth={2.5}
          />
          {lists.map((l) => (
            <circle
              cx={x(l.date)}
              cy={y(l.electors)}
              fill="var(--el-seq-1)"
              key={l.date}
              r={3.5}
            >
              <title>{`${formatIsoDate(l.date)}: ${fmt(l.electors)} electors`}</title>
            </circle>
          ))}
          {[...new Set(lists.map((l) => l.date.slice(0, 4)))].map((yr) => (
            <text
              className="fill-(--el-muted) text-[10px] max-sm:text-[16px]"
              key={yr}
              textAnchor="middle"
              x={x(`${yr}-07-01`)}
              y={H - 8}
            >
              {yr}
            </text>
          ))}
        </svg>
      </Section>

      <Section
        id="new"
        intro="Electors listed in each PEO constituency addendum."
        title="New registrations each quarter"
      >
        <ul className="max-w-3xl space-y-1.5 text-sm">
          {adds.map((a) => (
            <li
              className="grid grid-cols-[8rem_1fr_4rem] items-center gap-3"
              key={a.date}
            >
              <span className="text-el-muted tabular-nums">
                {formatIsoDate(a.date)}
              </span>
              <span className="h-3 bg-el-paper-2">
                <span
                  className="block h-full bg-el-seq-1"
                  style={{ width: `${(a.added / maxAdd) * 100}%` }}
                />
              </span>
              <span className="text-right tabular-nums">{fmt(a.added)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="adds-up"
        intro={
          <>
            Previous list + new registrations − next list = people removed or
            transferred. The PEO doesn’t publish removals, so these are implied;
            see{" "}
            <Link className="underline underline-offset-2" href="/sources#V-01">
              V-01
            </Link>
            .
          </>
        }
        title="Does the roll add up?"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-el-ink border-b text-left">
                {[
                  "From",
                  "To",
                  "Previous list",
                  "Added",
                  "Next list",
                  "Implied removals",
                ].map((h, i) => (
                  <th
                    className={`py-2 pr-3 font-semibold ${i > 1 ? "text-right" : ""}`}
                    key={h}
                    scope="col"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr className="border-el-rule border-b" key={c.from}>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {formatIsoDate(c.from)}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {formatIsoDate(c.to)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {fmt(c.previous)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {fmt(c.added)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {fmt(c.next)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">
                    {fmt(c.implied)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="where"
        intro={`Change in electors by polling division, ${formatIsoDate(first.date)} to ${formatIsoDate(last.date)}.`}
        title="Where the roll grew"
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <figure>
            <FlatMap
              geo={geo}
              label="Change in electors by polling division"
              level="div"
              regions={growth.map((g) => ({
                code: g.division,
                fill: g.first
                  ? growthFill((g.last - g.first) / g.first)
                  : "var(--el-paper-2)",
                title: `${g.division}: ${fmt(g.first)} → ${fmt(g.last)}${g.first ? ` (${pct((g.last - g.first) / g.first)})` : ""}`,
              }))}
            />
            <figcaption className="mt-2 text-xs">
              <span className="flex items-center gap-2">
                <span>No growth or fewer</span>
                <span
                  className="h-2.5 flex-1"
                  style={{
                    background: `linear-gradient(90deg, ${growthFill(0)}, ${growthFill(0.2)})`,
                  }}
                />
                <span>+20% or more</span>
              </span>
              <span className="mt-1 block text-el-muted">
                Boundaries are illustrative.
              </span>
            </figcaption>
          </figure>
          <div className="overflow-x-auto">
            <h3 className={LABEL}>By constituency, fastest growth first</h3>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-el-ink border-b text-left">
                  {[
                    "Constituency",
                    first.date.slice(0, 4),
                    last.date.slice(0, 4),
                    "Change",
                  ].map((h, i) => (
                    <th
                      className={`py-1.5 pr-3 font-semibold ${i > 0 ? "text-right" : ""}`}
                      key={h}
                      scope="col"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byCode.map((r) => (
                  <tr className="border-el-rule border-b" key={r.code}>
                    <td className="py-1.5 pr-3">
                      <Link
                        className="hover:underline"
                        href={constituencyHref(results, r.code)}
                      >
                        {constituencyName(results, r.code)}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {fmt(r.first)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">
                      {fmt(r.last)}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-semibold tabular-nums">
                      {pct(r.change)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section
        id="jobs"
        intro="The most common job titles as written on the lists. Titles are free text, so similar jobs are spelled different ways; treat these as rough."
        title="Most common job titles"
      >
        <ol className="grid max-w-4xl gap-x-8 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {register.topOccupations.slice(0, 24).map(([title, n], i) => (
            <li
              className="flex justify-between gap-3 border-el-rule border-b py-1"
              key={title}
            >
              <span>
                <span className="mr-2 text-el-muted tabular-nums">{i + 1}</span>
                {title.charAt(0) + title.slice(1).toLowerCase()}
              </span>
              <span className="tabular-nums">{fmt(n)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 max-w-[70ch] text-el-muted text-xs">
          {register.note}
        </p>
      </Section>
      <Section
        id="population-context"
        intro="Official demographic tables provide context, not a way to infer individual voting choices."
        title="The register is not the population"
      >
        <p className="max-w-prose text-sm leading-relaxed">
          The Central Statistical Office publishes population estimates and
          census tables by age, sex and geography. We have not joined those
          figures to constituencies: the dates, resident-population definitions
          and geographic boundaries need to match first. Dividing the electoral
          roll by an unmatched population estimate would create a misleading
          registration rate.
        </p>
        <div className="mt-4">
          <EvidenceCitation id="population" />
        </div>
      </Section>
    </>
  );
}
