import { findPerson, personHref } from "@/data/candidates";
import { eventSlug } from "@/data/events";
import { GUIDES } from "@/data/learning";
import { campaign, data, people, results } from "@/data/load";
import {
  CODES,
  constituencyHref,
  constituencyName,
  EVENTS,
} from "@/data/model";
import { partyInfo } from "@/data/parties";
import { partyRecords, partySlug } from "@/data/parties-history";
import type { SiteSearchEntry } from "@/data/site-search";
import type { ConstituencyCode } from "@/data/types";
export const dynamic = "force-static";
export function GET() {
  const index: SiteSearchEntry[] = [
    ...GUIDES.map((guide) => ({
      href: `/learn/${guide.slug}`,
      title: guide.title,
      kind: "Guide" as const,
      summary: guide.question,
      keywords: guide.keywords,
    })),
    ...people().map((person) => ({
      href: personHref(person),
      title: person.name,
      kind: "Person" as const,
      summary: `${person.first}–${person.last} · historical identity matching may be provisional`,
      keywords: person.parties,
    })),
    ...Object.entries(campaign.candidates).flatMap(([party, slate]) =>
      Object.entries(slate).flatMap(([code, name]) => {
        if (!name || findPerson(people(), name)) return [];
        return [
          {
            href: constituencyHref(results, code as ConstituencyCode),
            title: name,
            kind: "Person" as const,
            summary: `Announced for ${party} in ${constituencyName(results, code as ConstituencyCode)}; inspect the source on the constituency page`,
            keywords: [party, "2026"],
          },
        ];
      })
    ),
    {
      href: "/candidates",
      title: "Democratic People’s Movement",
      kind: "Party",
      summary:
        "Announced 2026 candidates; no past general-election record in this archive",
      keywords: ["DPM"],
    },
    ...partyRecords(data).map((party) => ({
      href: `/parties/${partySlug(party.code)}`,
      title: partyInfo(party.code).name,
      kind: "Party" as const,
      summary: "Recorded elections and evidence",
      keywords: [party.code],
    })),
    ...EVENTS.map((event) => ({
      href: `/elections/${eventSlug(event.id)}`,
      title: `${event.year} ${event.kind === "ref" ? "referendum" : "general election"}`,
      kind: "Election" as const,
      summary: "Results, sources and constituency records",
      keywords: [event.id],
    })),
    ...CODES.map((code) => ({
      href: constituencyHref(results, code),
      title: constituencyName(results, code),
      kind: "Constituency" as const,
      summary: "Representation and local election history",
      keywords: [code],
    })),
    ...[
      ["/2026", "Election 2026", "Current dates candidates announcements"],
      ["/trends", "How to read an election", "Trends turnout votes seats"],
      ["/how-close", "How close was it?", "Swing margins calculator"],
      [
        "/forecast",
        "Forecast assumptions and uncertainty",
        "Polls probabilities backtests",
      ],
      ["/make-your-map", "Make your map", "Scenario experiment prediction"],
      ["/register", "Voter register", "Registration snapshots population"],
      [
        "/sources",
        "Sources and methods",
        "Evidence discrepancies official records",
      ],
    ].map(([href = "/learn", title = "", summary = ""]) => ({
      href,
      title,
      summary,
      kind: "Tool" as const,
      keywords: [],
    })),
  ];
  return Response.json([
    ...new Map(
      index.map((entry) => [
        `${entry.kind}:${entry.title}:${entry.href}`,
        entry,
      ])
    ).values(),
  ]);
}
