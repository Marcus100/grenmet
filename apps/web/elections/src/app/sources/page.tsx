import type { Metadata } from "next";
import Link from "next/link";
import { EvidenceCitation } from "@/components/learn/evidence";
import { PageHead, Section } from "@/components/section";
import { eventSlug, eventSource } from "@/data/events";
import { EVIDENCE, type EvidenceId } from "@/data/evidence";
import {
  data,
  discrepancies as discrepanciesJson,
  register,
  validation as validationJson,
} from "@/data/load";
import { EVENTS } from "@/data/model";
import { snapshotTotals } from "@/data/register";
import { fmt, formatIsoDate, pct } from "@/lib/format";

export const metadata: Metadata = {
  title: "Sources",
  description:
    "Where every number on Elections Grenada comes from: the source for each vote, the checks run, the full dataset, and every known discrepancy.",
};

interface Discrepancy {
  action: string;
  area: string;
  detail?: (string | Record<string, string | number>)[];
  id: string;
  impact: "data" | "presentation" | "document" | "source";
  sources: string[];
  status: "open" | "resolved";
  what: string;
}

interface Validation {
  checks: {
    area: string;
    check: string;
    detail: string;
    status: "pass" | "fail" | "known";
  }[];
  summary: {
    candidateVerification: Record<string, number>;
    fail: number;
    known: number;
    pass: number;
  };
}

const IMPACT: Record<Discrepancy["impact"], string> = {
  data: "Affects figures",
  document: "Error in an official document",
  source: "Weak or secondary source",
  presentation: "Affects presentation",
};

const FILES = [
  [
    "master_contests.csv",
    "Contests",
    "One row per constituency contest, 1951–2022 plus both referendums: turnout, majority, margin, effective number of candidates, competitiveness, whether the seat changed hands, swing, source and verification.",
  ],
  [
    "master_candidates.csv",
    "Candidates",
    "One row per candidacy: votes, share, rank, elected, verification status and source.",
  ],
  [
    "master_stations.csv",
    "Polling stations",
    "One row per polling station and candidate or option, for 1972, 2013, 2016 (referendum), 2018, 2018 (referendum) and 2022.",
  ],
  [
    "master_register.csv",
    "Voter register",
    "Electors, women and men per polling division for every consolidated list.",
  ],
  [
    "master_discrepancies.csv",
    "Discrepancies",
    "The discrepancy register below, as a table.",
  ],
] as const;

const CHECKS_RUN = [
  [
    "2022: party totals, rejected ballots, ballots cast and registered voters across all 15 constituencies vs the report’s Final Summary",
    "Exact match (NDC 31,432 · NNP 28,960 · rejected 218 · cast 60,853 · registered 87,566)",
  ],
  [
    "2018: party totals vs the report’s Final Summary",
    "Exact match (NNP 33,792 · NDC 23,249 · rejected 251 · cast 57,615 · registered 78,295)",
  ],
  [
    "2013: party totals vs the report’s Final Summary Table",
    "Exact match (NNP 32,205 · NDC 22,377 · rejected 201 · cast 55,058 · registered 62,155)",
  ],
  [
    "2013–2022: every constituency’s ballots cast = valid votes + rejected, and polling stations add up to the constituency",
    "All balance except St. Patrick East 2022, where the report repeats P05 and leaves out P06(b) and the total",
  ],
  [
    "1984–2008: registered voters by constituency vs national totals",
    "Exact for 1984, 1995, 1999, 2003 and 2008. The 1990 column in the PEO document repeats the votes cast, so 1990 has no PEO registration figure",
  ],
  [
    "1984–2008: PEO winners’ summary page vs the PEO candidate table in the same document",
    "6 differences, listed in the register. The candidate table is used",
  ],
  [
    "2016 referendum: station totals vs the certificate’s national total",
    "Exact match (registered 71,240 · voted 23,651 · Yes 51,946 · No 100,140)",
  ],
  [
    "2018 referendum: station totals vs the Gazette TOTAL row",
    "Readable stations balance. 5 constituencies are unreadable in the damaged Gazette PDF (R-04)",
  ],
  [
    "Voter register: list-to-list change vs addenda registrations",
    "Implied removals each period listed in V-01; removals aren’t published",
  ],
] as const;

/** A detail line: text as is; a roll-reconciliation row as a sentence. */
function detailText(line: string | Record<string, string | number>): string {
  if (typeof line === "string") return line;
  if ("impliedRemovals" in line)
    return `${line.from} → ${line.to}: ${fmt(Number(line.before))} + ${fmt(Number(line.added))} added − ${fmt(Number(line.after))} = ${fmt(Number(line.impliedRemovals))} implied removals`;
  return Object.entries(line)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}

const LABEL = "font-semibold text-sm text-el-muted uppercase tracking-[0.07em]";
const STATUS_STYLE = {
  pass: "text-el-nnp-ink",
  fail: "text-el-gulp-ink",
  known: "text-el-ndc-ink",
} as const;

function level(e: (typeof EVENTS)[number]): string {
  if (e.divs) return "Polling station";
  if (e.map) return "Constituency";
  return "Constituency (old boundaries)";
}

export default function SourcesPage() {
  const register_ = discrepanciesJson as unknown as { items: Discrepancy[] };
  const items = [
    ...register_.items.filter((d) => d.status === "open"),
    ...register_.items.filter((d) => d.status !== "open"),
  ];
  const v = validationJson as unknown as Validation;
  const cv = v.summary.candidateVerification;
  const total = Object.values(cv).reduce((a, b) => a + b, 0);
  const lists = snapshotTotals(register);

  return (
    <>
      <PageHead
        deck="Our archive combines official records, contemporary reports and secondary compilations. In 1990, winners are officially declared but other inputs rely on a newspaper; early records are also mixed. Verification applies to the individual figure and calculation, not merely the election year."
        eyebrow="Sources and verification"
        learning="evidence"
        title="Where every number comes from"
      >
        <dl className="mt-6 grid grid-cols-2 gap-4 border-el-rule border-t pt-4 lg:grid-cols-4">
          {[
            ["Checks passed", fmt(v.summary.pass), ""],
            ["Failed", fmt(v.summary.fail), ""],
            [
              "Known source issues",
              fmt(v.summary.known),
              "listed in the register below",
            ],
            [
              "Candidate figures verified",
              pct((cv.official ?? 0) / total, 0),
              `${fmt(cv.official)} of ${fmt(total)}; ${fmt(cv.corroborated ?? 0)} †, ${fmt(cv.unverified ?? 0)} ✱, ${fmt(cv.check ?? 0)} ✱✱`,
            ],
          ].map(([label, value, note]) => (
            <div key={label}>
              <dt className={LABEL}>{label}</dt>
              <dd className="mt-0.5 font-semibold text-xl tabular-nums">
                {value}
              </dd>
              {note && <dd className="text-base text-el-muted">{note}</dd>}
            </div>
          ))}
        </dl>
      </PageHead>

      <Section
        id="evidence-policy"
        intro="A publisher’s authority and the certainty of a particular figure are separate questions."
        title="What our evidence labels mean"
      >
        <a
          className="mb-4 inline-block text-base underline underline-offset-4"
          href="/evidence.json"
        >
          Download evidence and calculation metadata (JSON)
        </a>
        <dl className="grid gap-5 text-base md:grid-cols-2">
          {[
            [
              "Official record",
              "PEO returns, Gazette notices, Parliament records and official statistics. They can still contain errors or conflicting figures.",
            ],
            [
              "Original publisher",
              "A party establishes its announcement; a pollster establishes its published survey. Neither certifies the election result.",
            ],
            [
              "Secondary or supplied",
              "A report about another record, or information supplied without a public document. Retained visibly; not promoted to official evidence.",
            ],
            [
              "Calculated or illustrative",
              "Our arithmetic inherits its inputs’ limitations. A scenario or worked example demonstrates a mechanism, not an observed event.",
            ],
          ].map(([term, meaning]) => (
            <div key={term}>
              <dt className="font-semibold">{term}</dt>
              <dd className="mt-1 text-el-ink-2">{meaning}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 max-w-prose text-base leading-relaxed">
          Vote share = candidate or party votes ÷ all valid votes. Turnout =
          ballots cast ÷ registered electors; where only valid votes exist we
          label the ratio as a proxy. A margin subtracts shares; a percentage
          change divides by the starting value. Missing inputs are never zeros.
          Official-data-only comparisons withhold a measure unless every
          required input is officially supported.
        </p>
      </Section>
      <Section
        id="source-library"
        intro="These references support the learning guides. Document dates are shown only where established; directory links do not independently verify a statistic."
        title="Read the primary publications"
      >
        <div className="space-y-4">
          {(Object.keys(EVIDENCE) as EvidenceId[]).map((id) => (
            <EvidenceCitation id={id} key={id} />
          ))}
        </div>
      </Section>
      <Section
        id="priority-gaps"
        intro="Missing from our archive does not mean the record does not exist. These gaps affect what we can responsibly teach or calculate."
        title="The most important gaps to close"
      >
        <ol className="grid list-inside list-decimal gap-4 text-base md:grid-cols-2">
          {[
            "Official constituency and polling-division boundary files: reconstructed shapes cannot settle voting eligibility.",
            "Complete early election returns and the 1976 official result notice: secondary figures remain labelled.",
            "Ballots cast and rejected in older elections: needed for comparable turnout, not just valid-vote proxies.",
            "St. Patrick East P06(b) in 2022 and an undamaged 2018 referendum Gazette: incomplete local counts cannot be treated as totals.",
            "Certified results for each 2016 referendum bill: combined responses are not unique participants.",
            "Police lists, election-day additions and transfer/removal definitions: registration changes need consistent coverage.",
            "Official nomination records and original poll reports: announcements, surveys and certified candidacies must remain distinct.",
          ].map((gap) => (
            <li className="leading-relaxed" key={gap}>
              {gap}
            </li>
          ))}
        </ol>
      </Section>

      <Section id="by-vote" title="By vote">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-base">
            <thead>
              <tr className="border-el-ink border-b text-left">
                {["Vote", "Source", "Level", "Status"].map((h) => (
                  <th className="py-2 pr-3 font-semibold" key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...EVENTS].reverse().map((e) => {
                const s = eventSource(data, e.id);
                let status = "Official";
                if (!s.official)
                  status = s.partial ? "Partly official" : "Secondary";
                return (
                  <tr className="border-el-rule border-b align-top" key={e.id}>
                    <td className="whitespace-nowrap py-2 pr-3">
                      <Link
                        className="font-semibold hover:underline"
                        href={`/elections/${eventSlug(e.id)}`}
                      >
                        {e.year} {e.sub ? e.sub.toLowerCase() : "election"}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-el-ink-2">{s.text}</td>
                    <td className="py-2 pr-3">
                      {e.id === "2018r"
                        ? "Polling station (10 of 15 constituencies)"
                        : level(e)}
                    </td>
                    <td className="py-2 pr-3 font-semibold">{status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="checks" title="Checks run">
        <ul className="divide-y divide-el-rule border-el-rule border-y text-base">
          {CHECKS_RUN.map(([check, result]) => (
            <li
              className="grid gap-1 py-2.5 sm:grid-cols-2 sm:gap-6"
              key={check}
            >
              <span>{check}</span>
              <span className="text-el-ink-2">{result}</span>
            </li>
          ))}
        </ul>
        <h3 className={`${LABEL} mt-8`}>Automated checks</h3>
        <p className="mt-1 max-w-[70ch] text-base text-el-muted leading-relaxed">
          These run every time the dataset is rebuilt from the source documents.
          “Known” means the problem is in a source document and is listed in the
          register below.
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold text-base">
            All {v.checks.length} checks
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-base">
              <tbody>
                {v.checks.map((c) => (
                  <tr
                    className="border-el-rule border-b align-top"
                    key={`${c.area}${c.check}`}
                  >
                    <td className="whitespace-nowrap py-1.5 pr-3 text-el-muted">
                      {c.area}
                    </td>
                    <td className="py-1.5 pr-3">
                      {c.check}
                      {c.detail && c.status !== "pass" && (
                        <span className="block text-base text-el-muted">
                          {c.detail}
                        </span>
                      )}
                    </td>
                    <td
                      className={`py-1.5 pr-3 font-semibold capitalize ${STATUS_STYLE[c.status]}`}
                    >
                      {c.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Section>

      <Section
        id="data"
        intro="The full dataset as plain CSV tables. Every row carries its source document, page and verification status."
        title="The master list"
      >
        <ul className="grid gap-px border border-el-rule bg-el-rule md:grid-cols-2">
          {FILES.map(([file, title, about]) => (
            <li className="bg-background p-4" key={file}>
              <a
                className="font-bold font-serif text-lg underline-offset-4 hover:underline"
                data-analytics-event="csv_download_clicked"
                download
                href={`/data/${file}`}
              >
                {title} (CSV)
              </a>
              <p className="mt-1 text-base text-el-ink-2 leading-relaxed">
                {about}
              </p>
              <code className="text-base text-el-muted">{file}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="register"
        intro="Every known conflict, gap or weak source, with what would close it. Open items are what to ask the Parliamentary Elections Office, the Government Printery or the archives for."
        title="Discrepancy register"
      >
        <p className="mb-3 text-base leading-relaxed">
          <b>{items.filter((d) => d.status === "open").length}</b> open ·{" "}
          <b>{items.filter((d) => d.status === "resolved").length}</b> resolved
          · <b>{items.filter((d) => d.impact === "data").length}</b> affect
          figures
        </p>
        <ol className="divide-y divide-el-rule border-el-rule border-y">
          {items.map((d) => (
            <li
              className="grid scroll-mt-20 gap-x-6 gap-y-1 py-3 text-base lg:grid-cols-[5rem_12rem_minmax(0,1fr)_minmax(0,1fr)_6rem]"
              id={d.id}
              key={d.id}
            >
              <b className="font-semibold">{d.id}</b>
              <span>
                {d.area}
                <span className="block text-base text-el-muted">
                  {IMPACT[d.impact]}
                </span>
              </span>
              <span>
                {d.what}
                {d.detail && d.detail.length > 0 && (
                  <details className="mt-1 text-base">
                    <summary className="cursor-pointer text-el-muted">
                      {d.detail.length} detail{d.detail.length === 1 ? "" : "s"}
                    </summary>
                    <ul className="mt-1 list-disc pl-4 text-el-ink-2">
                      {d.detail.map((line) => (
                        <li key={detailText(line)}>{detailText(line)}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <span className="block text-base text-el-muted">
                  Sources: {d.sources.join("; ")}
                </span>
              </span>
              <span className="text-el-ink-2">{d.action}</span>
              <span
                className={`font-semibold capitalize ${d.status === "open" ? "text-el-gulp-ink" : "text-el-nnp-ink"}`}
              >
                {d.status}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="other" title="Other sources">
        <dl className="grid gap-4 text-base md:grid-cols-2">
          <div>
            <dt className="font-semibold">Map boundaries</dt>
            <dd className="text-el-ink-2">
              No official boundary map is published. Shapes are 2011-era census
              enumeration districts (public ArcGIS layer, publisher to be
              confirmed), grouped into polling divisions using the PEO’s table
              of villages and polling divisions and OpenStreetMap place names.
              They are illustrative, not official. See G-01 and G-02.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Voter register</dt>
            <dd className="text-el-ink-2">
              Counts from the PEO consolidated lists of electors,{" "}
              {formatIsoDate(lists[0]?.date ?? "")} to{" "}
              {formatIsoDate(lists.at(-1)?.date ?? "")}, and the quarterly
              constituency addenda. Only totals are published here.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Election dates</dt>
            <dd className="text-el-ink-2">
              From Wikipedia’s election articles, cross-checked with dates
              printed in the PEO documents for 1984 onward.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">2026 campaign</dt>
            <dd className="text-el-ink-2">
              Candidates, events and polls are cited item by item to news
              reports and other public sources on the{" "}
              <Link className="underline underline-offset-2" href="/updates">
                Updates
              </Link>{" "}
              and{" "}
              <Link
                className="underline underline-offset-2"
                href="/forecast#polls"
              >
                Forecast
              </Link>{" "}
              pages, with ✱ where an official source is still needed.
            </dd>
          </div>
        </dl>
      </Section>
    </>
  );
}
