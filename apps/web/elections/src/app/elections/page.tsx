import type { Metadata } from "next";
import Link from "next/link";
import { SeatBar } from "@/components/results/seat-bar";
import { PageHead, Section } from "@/components/section";
import {
  eventHeadline,
  eventNational,
  eventSlug,
  isOfficial,
} from "@/data/events";
import { data } from "@/data/load";
import { EVENTS } from "@/data/model";
import { partyInfo } from "@/data/parties";
import { pct } from "@/lib/format";

export const metadata: Metadata = {
  title: "Every election",
  description:
    "All 17 Grenada general elections since 1951 and both constitutional referendums, with every candidate’s votes and the source for each figure.",
};

export default function ElectionsPage() {
  const events = [...EVENTS].reverse();
  return (
    <>
      <PageHead
        deck="Seventeen general elections and two referendums. From 1951 to 2008 the record goes down to each constituency’s candidates; from 2013, and for both referendums, to every polling division and station."
        eyebrow="Archive · 1951 to 2022"
        learning="results"
        title="Every general election and referendum"
      />
      <Section id="list" title="All votes, newest first">
        <ol className="divide-y divide-el-rule border-el-rule border-y">
          {events.map((e) => {
            const n = eventNational(data, e.id);
            const order = Object.entries(n.seats).sort((a, b) => b[1] - a[1]);
            const seatsTotal = order.reduce((a, [, k]) => a + k, 0);
            const headline = eventHeadline(data, e.id);
            return (
              <li key={e.id}>
                <Link
                  className="grid gap-x-6 gap-y-1 py-4 hover:bg-el-paper-2 sm:grid-cols-[7rem_minmax(0,1fr)_auto]"
                  href={`/elections/${eventSlug(e.id)}`}
                >
                  <span className="font-bold font-serif text-2xl tabular-nums">
                    {e.year}
                    {e.sub && (
                      <span
                        className={
                          e.kind === "ref"
                            ? "block font-sans font-semibold text-base text-el-muted uppercase tracking-[0.07em]"
                            : ""
                        }
                      >
                        {e.sub}
                      </span>
                    )}
                  </span>
                  <span>
                    <span className="block text-base text-el-muted">
                      {e.date}
                    </span>
                    <b className="font-semibold">{headline}</b>
                    {!isOfficial(e.id) && (
                      <span className="ml-2 inline-block rounded-[2px] border border-el-rule-2 px-1 font-semibold text-el-ink-2 text-sm uppercase tracking-[0.06em]">
                        Secondary source
                      </span>
                    )}
                    <span className="block text-base text-el-muted">
                      {e.kind === "general"
                        ? `${seatsTotal} seats${e.map ? "" : " on earlier boundaries"} · winner ${partyInfo(order[0]?.[0] ?? "").name}`
                        : `Turnout ${pct(n.turnout)}`}
                      {e.divs && " · polling divisions"}
                    </span>
                  </span>
                  {e.kind === "general" && (
                    <SeatBar
                      className="max-w-[16rem] self-center"
                      seats={n.seats}
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      </Section>
    </>
  );
}
