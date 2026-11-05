import type { Metadata, Route } from "next";
import Link from "next/link";
import {
  CandidateDirectory,
  type DirectoryRow,
} from "@/components/candidates/directory";
import { Flag } from "@/components/flag";
import { PartyDot } from "@/components/party-chip";
import { PageHead, Section } from "@/components/section";
import { SlateSources } from "@/components/slate-sources";
import { findPerson, personHref } from "@/data/candidates";
import { candidateNote, slateSources } from "@/data/election-2026";
import { campaign, people, results } from "@/data/load";
import { CODES, constituencyHref, constituencyName } from "@/data/model";
import { partyInfo } from "@/data/parties";
import type { ConstituencyCode } from "@/data/types";
import { fmt, formatIsoDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Candidates",
  description:
    "Who is standing in Grenada’s 2026 election, and everyone who has stood for the House since 1951, with each person’s record and sources.",
};

const LABEL = "font-semibold text-sm text-el-muted uppercase tracking-[0.07em]";
const SLATES = ["NNP", "DPM", "NDC"] as const;

export default function CandidatesPage() {
  const everyone = people();
  const races = everyone.reduce((a, p) => a + p.races.length, 0);
  const mostWins = [...everyone].sort((a, b) => b.wins - a.wins)[0];
  const longest = [...everyone].sort(
    (a, b) => b.last - b.first - (a.last - a.first)
  )[0];

  const rows: DirectoryRow[] = everyone.map((p) => ({
    name: p.name,
    names: p.names,
    href: personHref(p),
    parties: p.parties,
    codes: [...new Set(p.races.flatMap((r) => (r.code ? [r.code] : [])))],
    races: p.races.length,
    wins: p.wins,
    first: p.first,
    last: p.last,
    best: p.bestShare,
  }));
  const partyCounts = new Map<string, number>();
  for (const p of everyone)
    for (const party of p.parties)
      partyCounts.set(party, (partyCounts.get(party) ?? 0) + 1);
  const parties = [...partyCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => ({ code, name: partyInfo(code).name }));

  return (
    <>
      <PageHead
        deck={`${fmt(races)} candidacies at 17 general elections, by about ${fmt(everyone.length)} people, plus a separately labelled 2026 announcement directory.`}
        eyebrow="Candidates · 1951 to 2026"
        learning="people"
        title="Everyone who has stood for the House"
      />

      <Section
        id="2026"
        intro={
          <>
            Earlier reported selections, with source notes. Named records
            reviewed through{" "}
            {formatIsoDate(campaign.candidate_names_as_of ?? campaign.updated)}.
            This is not the complete certified ballot. A link to a past record
            means a name match with someone who stood since 2008
            <Flag
              note="Matched by surname and first initial, not by an official identifier."
              status="unverified"
            />
            .
          </>
        }
        title="2026 nomination coverage"
      >
        {campaign.nomination_summary && (
          <p className="mb-4 max-w-prose text-base leading-relaxed">
            CMC reported <b>{campaign.nomination_summary.total} nominees</b> on
            26 October: NDC 15, NNP 15 and DPM 9. Seven other nominees are not
            identified in that breakdown. The names below are an earlier,
            incomplete directory, not a certified ballot.{" "}
            <a
              className="underline"
              href={campaign.sources[campaign.nomination_summary.src]?.[1]}
            >
              Read the report
            </a>
            .
          </p>
        )}
        <div className="border-el-rule bg-el-rule grid gap-px border md:grid-cols-3">
          {SLATES.map((party) => {
            const slate = Object.entries(campaign.candidates[party] ?? {}) as [
              ConstituencyCode,
              string,
            ][];
            return (
              <section className="bg-background p-4" key={party}>
                <h3 className="text-lg font-bold">
                  <PartyDot party={party} />
                  {partyInfo(party).name}
                </h3>
                <p className="text-el-muted text-base leading-relaxed">
                  {slate.length} named
                  {slateSources(campaign, party).length > 0 && (
                    <>
                      {" · "}
                      <SlateSources campaign={campaign} party={party} />
                    </>
                  )}
                </p>
                {slate.length === 0 ? (
                  <p className="text-el-ink-2 mt-3 text-base leading-relaxed">
                    {party === "NDC"
                      ? campaign.candidate_flags.NDC
                      : "No candidates named yet."}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1.5 text-base">
                    {slate
                      .sort((a, b) =>
                        constituencyName(results, a[0]).localeCompare(
                          constituencyName(results, b[0])
                        )
                      )
                      .map(([code, name]) => {
                        const past = findPerson(everyone, name);
                        const note = candidateNote(campaign, party, code);
                        return (
                          <li key={code}>
                            <b className="font-semibold">{name}</b>
                            {note && <Flag note={note} status="unverified" />}
                            <span className="text-el-muted block text-base">
                              <Link
                                className="hover:underline"
                                href={constituencyHref(results, code) as Route}
                              >
                                {constituencyName(results, code)}
                              </Link>
                              {past && (
                                <>
                                  {" · "}
                                  <Link
                                    className="underline underline-offset-2"
                                    href={personHref(past) as Route}
                                  >
                                    past record ({past.races.length} race
                                    {past.races.length === 1 ? "" : "s"})
                                  </Link>
                                </>
                              )}
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </Section>

      <Section id="everyone" title="Everyone since 1951">
        <dl className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ["Candidacies", fmt(races), ""],
            [
              "People, approx.",
              fmt(everyone.length),
              "names matched across elections",
            ],
            ["Most wins", String(mostWins?.wins ?? 0), mostWins?.name ?? ""],
            [
              "Longest span",
              `${(longest?.last ?? 0) - (longest?.first ?? 0)} yrs`,
              longest
                ? `${longest.name}, ${longest.first}–${longest.last}`
                : "",
            ],
          ].map(([label, value, note]) => (
            <div key={label}>
              <dt className={LABEL}>{label}</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums">
                {value}
              </dd>
              {note && <dd className="text-el-muted text-base">{note}</dd>}
            </div>
          ))}
        </dl>
        <CandidateDirectory
          constituencies={CODES.map((code) => ({
            code,
            name: constituencyName(results, code),
          }))}
          parties={parties}
          rows={rows}
        />
        <p className="text-el-muted mt-4 max-w-[70ch] text-base leading-relaxed">
          People are matched by surname and first initial across elections,
          split when full first names differ or races are more than 16 years
          apart. This can occasionally merge two people or split one;
          corrections are welcome. Votes before 1984 (and in 1976) are partly
          from secondary sources and are marked on each record.
        </p>
      </Section>
    </>
  );
}
