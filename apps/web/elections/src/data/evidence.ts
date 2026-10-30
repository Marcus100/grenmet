import {
  type Data,
  eventNational,
  eventResult,
  eventSource,
  type NationalEvent,
} from "@/data/events";
import { CODES, getEvent } from "@/data/model";
import type { ContestResult, SourceRef } from "@/data/types";

export type EvidenceKind = "official" | "original" | "secondary" | "supplied";
export interface EvidenceSource {
  kind: EvidenceKind;
  locator: string;
  note: string;
  published: string | null;
  publisher: string;
  title: string;
  url: string;
}
export const EVIDENCE_LABELS: Record<EvidenceKind, string> = {
  official: "Official record",
  original: "Original publisher",
  secondary: "Secondary report",
  supplied: "Supplied information",
};
export const EVIDENCE = {
  constitution: {
    title: "Constitution of Grenada",
    publisher: "Government of Grenada",
    url: "https://www.gov.gd/government/the-constitution",
    kind: "official",
    locator: "Sections 23, 30, 35, 39, 52–59",
    published: "1973",
    note: "Read the relevant section, not just a search excerpt. The historic text uses the monarch’s title at enactment.",
  },
  parliament: {
    title: "About Parliament",
    publisher: "Parliament of Grenada",
    url: "https://grenadaparliament.gd/about/",
    kind: "official",
    locator: "The Senate; The House of Representatives",
    published: null,
    note: "Institutional explanation; names and office-holders must be checked separately.",
  },
  peo: {
    title: "Parliamentary Elections Office",
    publisher: "PEO",
    url: "https://www.peogrenada.org/",
    kind: "official",
    locator: "Voter status and official documents",
    published: null,
    note: "Use current PEO notices for dates and practical arrangements; a historical report is not a current instruction.",
  },
  registration: {
    title: "Registration",
    publisher: "PEO",
    url: "https://peogrenada.org/registration-procedure/",
    kind: "official",
    locator: "Registration guidance",
    published: null,
    note: "General registration guidance. Election-period suspension and correction deadlines require the current dated PEO notice.",
  },
  report2022: {
    title: "General Election Report 2022",
    publisher: "PEO",
    url: "https://peogrenada.org/document/general-election-report-2022/",
    kind: "official",
    locator:
      "Nomination Day; counting narrative; Final Summary; constituency returns",
    published: null,
    note: "Describes the 23 June 2022 election. St. Patrick East contains missing/repeated pages; derived totals are identified in our discrepancy register.",
  },
  report2018: {
    title: "General Election Report 2018",
    publisher: "PEO",
    url: "https://peogrenada.org/document/general-election-report-2018/",
    kind: "official",
    locator: "Final count and Final Summary",
    published: null,
    note: "Historical report; not a source for current polling arrangements.",
  },
  documents: {
    title: "Official election document archive",
    publisher: "PEO",
    url: "https://peogrenada.org/documents/",
    kind: "official",
    locator: "Reports, certificates and legislation",
    published: null,
    note: "Document availability varies. A directory link identifies the publisher, not a verified figure.",
  },
  registerOctober: {
    title: "Consolidated list — 16 October 2026",
    publisher: "PEO",
    kind: "official",
    url: "https://peogrenada.org/document/consolidated-as-of-oct-16th-2026/",
    published: "2026-10-16",
    locator: "All 2,640 non-police pages; reference date 16/10/2026",
    note: "Our extraction: 95,908 records / 134 divisions. The separately dated summary webpage reports 97,020 / 132; scope remains unresolved. See V-04–V-06.",
  },
  registerSummary: {
    title: "Constituency summary — 2 October 2026",
    publisher: "PEO",
    kind: "official",
    url: "https://peogrenada.org/constituency-summary/",
    published: "2026-10-02",
    locator: "Price-list table: 97,020 persons / 132 divisions",
    note: "A separate dated source, not a replacement for the later consolidated PDF. Date shown is the table reference date, not a verified web publication date.",
  },
  population: {
    title: "Population and demography",
    publisher: "Central Statistical Office",
    url: "https://stats.gov.gd/subjects/population-2/",
    kind: "official",
    locator: "Population estimates and census tables",
    published: null,
    note: "Match reference dates, resident-population definitions and geography before comparing with registration. No demographic voting behaviour is inferred.",
  },
} satisfies Record<string, EvidenceSource>;
export type EvidenceId = keyof typeof EVIDENCE;

/** Legacy campaign tuples remain readable; unknown publishers never become official by default. */
const WWW_PREFIX = /^www\./u;
export function sourceKind([label, url]: SourceRef): EvidenceKind {
  if (!url) return "supplied";
  // Our own copy of an official document, served from this site.
  if (url.startsWith("/documents/official/")) return "official";
  const host = new URL(url).hostname.replace(WWW_PREFIX, "");
  if (
    [
      "peogrenada.org",
      "grenadaparliament.gd",
      "gov.gd",
      "gazettes.gov.gd",
      "stats.gov.gd",
    ].includes(host)
  )
    return "official";
  if (host === "facebook.com" && url.includes("/supportndc/"))
    return "original";
  if (host === "medium.com" && url.includes("/@cjustinepierre/"))
    return "original";
  return label ? "secondary" : "supplied";
}

export type EvidenceMetric = "votes" | "seats" | "turnout";
export interface MetricEvidence {
  formula: string;
  label: string;
  note: string;
  official: boolean;
  source: string;
}
function verifiedVotes(result: ContestResult): boolean {
  return (
    result.c.length > 0 &&
    result.c.every(
      (row) =>
        row[3] === "official" ||
        (row[3] === undefined && result.official === true)
    )
  );
}
function verifiedWinner(row: ContestResult): boolean {
  return (
    row.c[0]?.[3] === "official" ||
    (row.c[0]?.[3] === undefined && row.official === true)
  );
}
function turnoutEvidence(national: NationalEvent, id: string, note: string) {
  const official =
    national.turnout !== null &&
    (id === "1972" ||
      ["peo", "peo-valid", "certificate"].includes(national.turnoutSource));
  const formula = ["peo-valid", "gazette-valid"].includes(
    national.turnoutSource
  )
    ? "Valid votes ÷ registered electors × 100 (proxy; rejected ballots unavailable)."
    : "Ballots cast ÷ registered electors × 100.";
  let explanation = note;
  if (["wikipedia", "newsletter"].includes(national.turnoutSource))
    explanation = "Registration or turnout depends on a secondary source.";
  if (national.turnout === null)
    explanation = "No usable denominator. Not treated as zero.";
  return { official, formula, note: explanation };
}
/** Evidence is evaluated for the whole calculation, never a filtered subset of its votes. */
export function metricEvidence(
  data: Data,
  id: string,
  metric: EvidenceMetric
): MetricEvidence {
  const event = getEvent(id);
  if (!event)
    return {
      official: false,
      label: "Unavailable",
      formula: "",
      source: "No event",
      note: "No record.",
    };
  const national = eventNational(data, id);
  const rows = event.map
    ? CODES.flatMap((code) => {
        const row = eventResult(data, id, code);
        return row ? [row] : [];
      })
    : (data.results.early[id] ?? []);
  const earlyCount = event.year <= 1957 ? 8 : 10;
  const complete = rows.length === (event.map ? CODES.length : earlyCount);
  let official =
    event.kind === "ref" || (complete && rows.every(verifiedVotes));
  let formula =
    "Party votes ÷ all valid votes × 100; totals sum the complete recorded contests.";
  let note = rows.some((row) => row.note)
    ? "Source discrepancies or qualifications exist; inspect the individual records. Official does not mean undisputed."
    : "Calculated from the recorded returns.";
  if (metric === "seats") {
    official = event.kind !== "ref" && complete && rows.every(verifiedWinner);
    formula =
      "Count one seat for each constituency winner. This is not proportional allocation.";
  }
  if (metric === "turnout") {
    const turnout = turnoutEvidence(national, id, note);
    official = turnout.official;
    formula = turnout.formula;
    note = turnout.note;
  }
  if (event.kind === "general" && !complete) {
    official = false;
    note =
      "Incomplete constituency coverage. This is not a complete national observation.";
  }
  if (id === "2016r")
    note =
      "Yes/No totals combine seven questions and are not counts of unique voters. Per-bill results are secondary; turnout uses people, not combined responses.";
  return {
    official,
    label: official
      ? "Calculated from official records"
      : "Calculated from mixed / secondary records",
    formula,
    source: eventSource(data, id).text,
    note,
  };
}
