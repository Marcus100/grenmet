import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Flag } from "@/components/flag";
import { FlatMap } from "@/components/map/flat-map";
import { PartyDot } from "@/components/party-chip";
import { PageHead, Section } from "@/components/section";
import { SourceLink } from "@/components/source-link";
import { candidateSource, seatOutlook } from "@/data/election-2026";
import { campaign, geo, registerHistory, results } from "@/data/load";
import {
  CODES,
  codeFromSlug,
  constituencyHref,
  contestStats,
  divisionResults,
  generalResult,
  leanLabel,
  seatHistory,
  slugify,
} from "@/data/model";
import { partyColor, partyInfo } from "@/data/parties";
import { fmt, formatIsoDate, pct } from "@/lib/format";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return CODES.map((code) => ({ slug: slugify(results.cons[code][0]) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = codeFromSlug(results, (await params).slug);
  if (!code) return {};
  const name = results.cons[code][0];
  return {
    title: name,
    description: `${name}: who holds the seat, who is standing in 2026, and every result since 1972 down to the polling division.`,
    alternates: { canonical: constituencyHref(results, code) },
  };
}

const LABEL =
  "font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]";

export default async function ConstituencyPage({ params }: Props) {
  const { slug } = await params;
  const code = codeFromSlug(results, slug);
  if (!code) notFound();
  // Old links by PEO letter (/constituencies/n) go to the named address.
  const href = constituencyHref(results, code);
  if (`/constituencies/${slug}` !== href) permanentRedirect(href);

  const seat = seatOutlook(results, campaign).find((s) => s.code === code);
  const contest = generalResult(results, "2022", code);
  if (!(seat && contest)) notFound();
  const stats = contestStats(contest);
  const history = seatHistory(results, code).reverse();
  const divisions = divisionResults(results, "2022", code);
  const roll = registerHistory(code);
  const firstRoll = roll[0];
  const lastRoll = roll.at(-1);

  return (
    <>
      <PageHead
        deck={`Held by ${seat.sitting.name} (${partyInfo(seat.sitting.party).name})${seat.sitting.was ? `, elected for the ${seat.sitting.was} in 2022` : ""}. ${seat.winner2022.party} won it by ${(seat.margin2022 * 100).toFixed(1)} points in 2022.`}
        eyebrow={`Constituency ${code}${seat.lean == null ? "" : ` · leans ${leanLabel(seat.lean)}`}`}
        title={seat.name}
      >
        <p className="mt-4 text-sm">
          <Link className="underline underline-offset-4" href="/constituencies">
            ← All 15 constituencies
          </Link>
        </p>
      </PageHead>

      <Section id="standing" title="Standing in 2026">
        <ul className="grid gap-px border border-el-rule bg-el-rule sm:grid-cols-3">
          {(["NDC", "NNP", "DPM"] as const).map((party) => {
            const named = seat.candidates.find((c) => c.party === party);
            const note = seat.notes[party];
            return (
              <li className="bg-background p-4" key={party}>
                <p className={LABEL}>
                  <PartyDot party={party} />
                  {partyInfo(party).name}
                </p>
                <p className="mt-1 font-bold font-serif text-lg">
                  {named?.name ??
                    (party === "NDC" && seat.sitting.party === "NDC"
                      ? seat.sitting.name
                      : "Not named")}
                  {note && <Flag note={note} status="unverified" />}
                </p>
                {!named && party === "NDC" && seat.sitting.party === "NDC" && (
                  <p className="text-el-muted text-xs">
                    Sitting member; not confirmed
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-el-muted text-xs">
          Updated {formatIsoDate(campaign.updated)}.
          {(["NDC", "NNP", "DPM"] as const).map((party) => {
            const id = seat.candidates.some((c) => c.party === party)
              ? candidateSource(campaign, party, code)
              : null;
            return id ? (
              <span key={party}>
                {" "}
                {party}: <SourceLink id={id} sources={campaign.sources} />.
              </span>
            ) : null;
          })}
        </p>
      </Section>

      <Section id="result" title="2022 result">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <table className="w-full text-sm">
              <caption className="sr-only">2022 candidates and votes</caption>
              <tbody>
                {contest.c.map((row, i) => (
                  <tr className="border-el-rule border-b" key={row[0]}>
                    <th className="py-2 pr-3 text-left font-normal" scope="row">
                      <b className={i === 0 ? "font-semibold" : "font-normal"}>
                        {row[0]}
                      </b>
                      <span className="block text-el-muted text-xs">
                        <PartyDot party={row[1]} />
                        {partyInfo(row[1]).name}
                        {i === 0 && " · won"}
                      </span>
                      <span className="mt-1 block h-1.5 bg-el-paper-2">
                        <span
                          className="block h-full"
                          style={{
                            width: `${(row[2] / stats.valid) * 100}%`,
                            background: partyColor(row[1]),
                          }}
                        />
                      </span>
                    </th>
                    <td className="py-2 text-right tabular-nums">
                      <b>{pct(row[2] / stats.valid)}</b>
                      <span className="block text-el-muted text-xs">
                        {fmt(row[2])}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              {[
                ["Majority", fmt(stats.majority)],
                ["Turnout", pct(stats.turnout)],
                ["Registered", fmt(contest.reg)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className={LABEL}>{label}</dt>
                  <dd className="font-semibold text-lg tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-el-muted text-xs">
              Source: Parliamentary Elections Office, General Election Report
              2022
              {contest.page ? `, p. ${contest.page}` : ""}.
            </p>
          </div>
          <FlatMap
            className="max-w-md"
            geo={geo}
            label={`${seat.name} polling divisions, coloured by the 2022 winner in each`}
            level="div"
            regions={divisions.map((d) => ({
              code: d.division,
              fill: d.c[0] ? partyColor(d.c[0][1]) : "var(--el-land)",
              title: `${d.division}${d.places[0] ? ` · ${d.places[0]}` : ""}: ${d.c[0]?.[1] ?? "no result"}`,
            }))}
          />
        </div>
      </Section>

      <Section
        id="divisions"
        intro="Polling stations added up to their polling division."
        title={`${divisions.length} polling divisions in 2022`}
      >
        <ul className="divide-y divide-el-rule border-el-rule border-y">
          {divisions.map((d) => {
            const valid = d.c.reduce((sum, r) => sum + r[2], 0) || 1;
            const [first, second] = d.c;
            return (
              <li
                className="flex items-center gap-3 py-2.5 text-sm"
                key={d.division}
              >
                <span className="w-10 shrink-0 font-semibold tabular-nums">
                  {d.division}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {d.places.join(", ") || "—"}
                  </span>
                  <span className="mt-1 flex h-1.5 gap-px">
                    {d.c.map((r) => (
                      <span
                        key={r[1]}
                        style={{
                          width: `${(r[2] / valid) * 100}%`,
                          background: partyColor(r[1]),
                        }}
                      />
                    ))}
                  </span>
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums">
                  {first
                    ? `${first[1]} +${(((first[2] - (second?.[2] ?? 0)) / valid) * 100).toFixed(0)}`
                    : "–"}
                  <span className="block text-el-muted text-xs">
                    {fmt(d.cast)} voted
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        id="history"
        more={{ href: "/elections", label: "Every election" }}
        title="Every result since 1972"
      >
        <ol className="divide-y divide-el-rule border-el-rule border-y text-sm">
          {history.map((h) => (
            <li className="flex items-baseline gap-3 py-2.5" key={h.year}>
              <span className="w-12 shrink-0 font-semibold tabular-nums">
                {h.year}
              </span>
              <span className="min-w-0 flex-1">
                <PartyDot party={h.winner.party} />
                {h.winner.name}, {h.winner.party}
                {h.runnerUp && (
                  <span className="text-el-muted">
                    {" "}
                    over {h.runnerUp.name}, {h.runnerUp.party}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums">
                +{(h.margin * 100).toFixed(1)}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      {firstRoll && lastRoll && (
        <Section
          id="roll"
          more={{ href: "/register", label: "Voter register" }}
          title="On the roll"
        >
          <p className="text-el-ink-2">
            <b className="font-semibold text-el-ink tabular-nums">
              {fmt(lastRoll.electors)}
            </b>{" "}
            electors on the {formatIsoDate(lastRoll.date)} list, up from{" "}
            {fmt(firstRoll.electors)} on {formatIsoDate(firstRoll.date)} (
            {pct((lastRoll.electors - firstRoll.electors) / firstRoll.electors)}
            ). Counted from the Parliamentary Elections Office consolidated
            lists; police voters are not included.
          </p>
        </Section>
      )}
    </>
  );
}
