import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flag } from "@/components/flag";
import { PartyDot } from "@/components/party-chip";
import { PageHead, Section } from "@/components/section";
import { SourceLink } from "@/components/source-link";
import { findPerson, type Person } from "@/data/candidates";
import { candidateNote, candidateSource } from "@/data/election-2026";
import { eventSlug, eventSource } from "@/data/events";
import { campaign, data, people, results } from "@/data/load";
import { constituencyHref, slugify } from "@/data/model";
import { partyColor, partyInfo } from "@/data/parties";
import type { ConstituencyCode } from "@/data/types";
import { fmt, pct } from "@/lib/format";

interface Props {
  params: Promise<{ slug: string }>;
}

function bySlug(slug: string): Person | undefined {
  return people().find((p) => slugify(p.key) === slug);
}

export function generateStaticParams() {
  return people().map((p) => ({ slug: slugify(p.key) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const person = bySlug((await params).slug);
  if (!person) return {};
  return {
    title: person.name,
    description: `${person.name}: ${person.races.length} race${person.races.length === 1 ? "" : "s"} for Grenada’s House of Representatives, ${person.first}–${person.last}, ${person.wins} won.`,
  };
}

/** 2026 slots whose named candidate matches this record (same rule as the Candidates page). */
function standing2026(
  person: Person
): { code: ConstituencyCode; party: string; name: string }[] {
  const everyone = people();
  return Object.entries(campaign.candidates).flatMap(([party, slate]) =>
    (Object.entries(slate) as [ConstituencyCode, string][])
      .filter(([, name]) => findPerson(everyone, name) === person)
      .map(([code, name]) => ({ code, party, name }))
  );
}

export default async function PersonPage({ params }: Props) {
  const person = bySlug((await params).slug);
  if (!person) notFound();
  const races = [...person.races].sort((a, b) => b.year - a.year);
  const next = standing2026(person);
  const W = 560;
  const H = 160;
  const years = person.races.map((r) => r.year);
  const minY = Math.min(...years, 1951);
  const maxY = Math.max(...years, 2022);
  const x = (y: number) =>
    30 + ((y - minY) / Math.max(1, maxY - minY)) * (W - 50);
  const y = (share: number) => H - 24 - share * (H - 40);

  return (
    <>
      <PageHead
        deck={`${person.races.length} race${person.races.length === 1 ? "" : "s"} for the House, ${person.first === person.last ? person.first : `${person.first}–${person.last}`}; ${person.wins} won. Parties: ${person.parties.map((p) => partyInfo(p).name).join(", ")}.`}
        eyebrow="Candidate record"
        learning="people"
        title={person.name}
      >
        {person.names.length > 1 && (
          <p className="mt-3 text-el-muted text-sm">
            Also recorded as:{" "}
            {person.names.filter((n) => n !== person.name).join("; ")}.
          </p>
        )}
        <p className="mt-3 text-sm">
          <Link className="underline underline-offset-4" href="/candidates">
            ← All candidates
          </Link>
        </p>
      </PageHead>

      {next.length > 0 && (
        <Section id="2026" title="Standing in 2026">
          <ul className="text-sm">
            {next.map((n) => (
              <li key={`${n.party}${n.code}`}>
                <PartyDot party={n.party} />
                {n.name}
                {candidateNote(campaign, n.party, n.code) && (
                  <Flag
                    note={candidateNote(campaign, n.party, n.code)}
                    status="unverified"
                  />
                )}{" "}
                for the {partyInfo(n.party).name} in{" "}
                <Link
                  className="underline underline-offset-2"
                  href={constituencyHref(results, n.code)}
                >
                  {results.cons[n.code][0]}
                </Link>
                <Flag
                  note="Matched to this record by surname and first initial, not an official identifier."
                  status="unverified"
                />
                {candidateSource(campaign, n.party, n.code) && (
                  <span className="text-el-muted">
                    {" · "}
                    <SourceLink
                      id={candidateSource(campaign, n.party, n.code) ?? ""}
                      sources={campaign.sources}
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {person.races.length > 1 && (
        <Section id="share" title="Share of the vote over time">
          <svg
            aria-label={`${person.name}'s share of the vote in each race`}
            className="h-auto w-full max-w-2xl"
            role="img"
            viewBox={`0 0 ${W} ${H}`}
          >
            {[0, 0.25, 0.5, 0.75].map((v) => (
              <g key={v}>
                <line
                  stroke="var(--el-rule)"
                  x1={30}
                  x2={W - 10}
                  y1={y(v)}
                  y2={y(v)}
                />
                <text
                  className="fill-(--el-muted) text-[10px] max-sm:text-[16px]"
                  x={0}
                  y={y(v) + 3}
                >
                  {v * 100}%
                </text>
              </g>
            ))}
            {[...person.races]
              .sort((a, b) => a.year - b.year)
              .map((r) => (
                <circle
                  cx={x(r.year)}
                  cy={y(r.share)}
                  fill={r.won ? partyColor(r.party) : "var(--el-paper)"}
                  key={`${r.eventId}${r.constituency}`}
                  r={6}
                  stroke={partyColor(r.party)}
                  strokeWidth={2.5}
                >
                  <title>{`${r.year}, ${r.constituency}: ${pct(r.share)} (${r.party}${r.won ? ", won" : ""})`}</title>
                </circle>
              ))}
            {[...new Set(years)].map((yr) => (
              <text
                className="fill-(--el-muted) text-[10px] max-sm:text-[16px]"
                key={yr}
                textAnchor="middle"
                x={x(yr)}
                y={H - 6}
              >
                {yr}
              </text>
            ))}
          </svg>
          <p className="text-el-muted text-xs">Filled dots are wins.</p>
        </Section>
      )}

      <Section id="races" title="Every race">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-el-ink border-b text-left">
                {[
                  "Election",
                  "Constituency",
                  "Party",
                  "Votes",
                  "Share",
                  "Result",
                ].map((h) => (
                  <th
                    className={`py-2 pr-3 font-semibold ${["Votes", "Share"].includes(h) ? "text-right" : ""}`}
                    key={h}
                    scope="col"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {races.map((r) => {
                const src = eventSource(data, r.eventId, r.code ?? undefined);
                return (
                  <tr
                    className="border-el-rule border-b align-top"
                    key={`${r.eventId}${r.constituency}${r.party}`}
                  >
                    <td className="py-2 pr-3">
                      <Link
                        className="hover:underline"
                        href={`/elections/${eventSlug(r.eventId)}`}
                      >
                        {r.year}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      {r.code ? (
                        <Link
                          className="hover:underline"
                          href={constituencyHref(results, r.code)}
                        >
                          {r.constituency}
                        </Link>
                      ) : (
                        r.constituency
                      )}
                      <span className="block text-el-muted text-xs">
                        {src.text}
                        {src.official ? "" : " (secondary)"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      <PartyDot party={r.party} />
                      {r.party}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {fmt(r.votes)}
                      <Flag status={r.verification} />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {pct(r.share)}
                    </td>
                    <td className="py-2 pr-3">
                      {r.won ? <b>Won</b> : `${r.rank} of ${r.of}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-[70ch] text-el-muted text-xs">
          This record joins races by surname and first initial
          <Flag
            note="Not an official identifier: two people can share a name, and one person can be recorded differently."
            status="unverified"
          />
          . If it mixes two people or misses a race, tell us and we will correct
          it.
        </p>
      </Section>
    </>
  );
}
