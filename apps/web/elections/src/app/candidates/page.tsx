import type { Metadata } from "next";
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

const LABEL =
  "font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]";
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
        deck={`${fmt(races)} candidacies at 17 general elections, by about ${fmt(everyone.length)} people, and the candidates named so far for 2026.`}
        eyebrow="Candidates · 1951 to 2026"
        learning="people"
        title="Everyone who has stood for the House"
      />

      <Section
        id="2026"
        intro={
          <>
            Names reported so far, with sources and uncertainty notes; updated{" "}
            {formatIsoDate(campaign.updated)}. A link to a past record means a
            name match with someone who stood since 2008
            <Flag
              note="Matched by surname and first initial, not by an official identifier."
              status="unverified"
            />
            .
          </>
        }
        title="Standing in 2026"
      >
        <div className="grid gap-px border border-el-rule bg-el-rule md:grid-cols-3">
          {SLATES.map((party) => {
            const slate = Object.entries(campaign.candidates[party] ?? {}) as [
              ConstituencyCode,
              string,
            ][];
            return (
              <section className="bg-background p-4" key={party}>
                <h3 className="font-bold text-lg">
                  <PartyDot party={party} />
                  {partyInfo(party).name}
                </h3>
                <p className="text-el-muted text-xs">
                  {slate.length} named
                  {slateSources(campaign, party).length > 0 && (
                    <>
                      {" · "}
                      <SlateSources campaign={campaign} party={party} />
                    </>
                  )}
                </p>
                {slate.length === 0 ? (
                  <p className="mt-3 text-el-ink-2 text-sm">
                    {party === "NDC"
                      ? campaign.candidate_flags.NDC
                      : "No candidates named yet."}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1.5 text-sm">
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
                            <span className="block text-el-muted text-xs">
                              <Link
                                className="hover:underline"
                                href={constituencyHref(results, code)}
                              >
                                {constituencyName(results, code)}
                              </Link>
                              {past && (
                                <>
                                  {" · "}
                                  <Link
                                    className="underline underline-offset-2"
                                    href={personHref(past)}
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
              <dd className="mt-0.5 font-semibold text-xl tabular-nums">
                {value}
              </dd>
              {note && <dd className="text-el-muted text-xs">{note}</dd>}
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
        <p className="mt-4 max-w-[70ch] text-el-muted text-xs">
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
