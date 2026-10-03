import type { Metadata } from "next";
import Link from "next/link";
import { PartyDot } from "@/components/party-chip";
import { PageHead, Section } from "@/components/section";
import { data } from "@/data/load";
import { partyInfo } from "@/data/parties";
import { partyRecords, partySlug } from "@/data/parties-history";
import { fmt, pct } from "@/lib/format";

export const metadata: Metadata = {
  title: "Parties",
  description:
    "Every party that has contested a Grenada general election since 1951: seats, votes and candidates at each election.",
};

export default function PartiesPage() {
  const records = partyRecords(data)
    .map((r) => ({
      ...r,
      seats: r.years.reduce((a, y) => a + y.seats, 0),
      best: Math.max(...r.years.map((y) => y.share)),
      first: Math.min(...r.years.map((y) => y.year)),
      last: Math.max(...r.years.map((y) => y.year)),
    }))
    .filter((r) => r.code !== "IND")
    .sort((a, b) => b.seats - a.seats || b.best - a.best);

  return (
    <>
      <PageHead
        deck="Every party that has stood at a general election since 1951, with the seats it won and its share of the vote. Independents are counted with their constituencies, not here. The Democratic People’s Movement, founded in 2025, has not yet contested an election."
        eyebrow="Parties · 1951 to 2022"
        learning="parties"
        title="Grenada’s political parties"
      />
      <Section id="all" title="By seats won">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-base">
            <thead>
              <tr className="border-el-ink border-b text-left">
                {[
                  "Party",
                  "Elections",
                  "Years",
                  "Seats won",
                  "Best vote share",
                ].map((h, i) => (
                  <th
                    className={`py-2 pr-3 font-semibold ${i > 2 ? "text-right" : ""}`}
                    key={h}
                    scope="col"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr className="border-el-rule border-b" key={r.code}>
                  <td className="py-2 pr-3">
                    <Link
                      className="font-semibold hover:underline"
                      href={`/parties/${partySlug(r.code)}`}
                    >
                      <PartyDot party={r.code} />
                      {partyInfo(r.code).name}
                    </Link>
                    <span className="ml-1 text-base text-el-muted">
                      {r.code}
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{r.years.length}</td>
                  <td className="py-2 pr-3 tabular-nums">
                    {r.first === r.last ? r.first : `${r.first}–${r.last}`}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {fmt(r.seats)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {pct(r.best)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-base text-el-muted leading-relaxed">
          Votes before 1984 are partly from secondary sources; see each
          election’s page for its source.
        </p>
      </Section>
    </>
  );
}
