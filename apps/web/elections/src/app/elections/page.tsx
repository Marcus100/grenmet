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
    "Grenada’s recorded general elections from 1951 to 2022 and the 2016 and 2018 referendums, with constituency results, sources and archival gaps.",
};

export default function ElectionsPage() {
  const events = [...EVENTS].reverse();
  return (
    <>
      <PageHead
        deck="Seventeen general elections from 1951 to 2022 and two referendums. Explore constituency results, with polling-division and station records from 2013 and for the referendums where readable. Missing pages and mixed sources are marked alongside the figures."
        eyebrow="Archive · 1951 to 2022"
        learning="results"
        title="Every general election and referendum"
      >
        <Link
          className="mt-4 inline-block underline underline-offset-4"
          href="/2026"
        >
          Follow the 2026 election →
        </Link>
      </PageHead>
      <Section id="list" title="All votes, newest first">
        <ol className="divide-el-rule border-el-rule divide-y border-y">
          {events.map((e) => {
            const n = eventNational(data, e.id);
            const order = Object.entries(n.seats).sort((a, b) => b[1] - a[1]);
            const seatsTotal = order.reduce((a, [, k]) => a + k, 0);
            const headline = eventHeadline(data, e.id);
            return (
              <li key={e.id}>
                <Link
                  className="hover:bg-el-paper-2 grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[7rem_minmax(0,1fr)_auto]"
                  href={`/elections/${eventSlug(e.id)}`}
                >
                  <span className="font-serif text-2xl font-bold tabular-nums">
                    {e.year}
                    {e.sub && (
                      <span
                        className={
                          e.kind === "ref"
                            ? "text-el-muted block font-sans text-base font-semibold tracking-[0.07em] uppercase"
                            : ""
                        }
                      >
                        {e.sub}
                      </span>
                    )}
                  </span>
                  <span>
                    <span className="text-el-muted block text-base">
                      {e.date}
                    </span>
                    <b className="font-semibold">{headline}</b>
                    {!isOfficial(e.id) && (
                      <span className="border-el-rule-2 text-el-ink-2 ml-2 inline-block rounded-[2px] border px-1 text-sm font-semibold tracking-[0.06em] uppercase">
                        Secondary source
                      </span>
                    )}
                    <span className="text-el-muted block text-base">
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
