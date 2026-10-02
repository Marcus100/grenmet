import Link from "next/link";
import { CampaignTimeline } from "@/components/campaign/timeline";
import { ClosestContests } from "@/components/constituencies/closest-contests";
import { ConstituencyGrid } from "@/components/constituencies/constituency-card";
import { HouseMap } from "@/components/constituencies/house-map";
import { ConstituencySearch } from "@/components/constituency-search";
import { HouseStrip } from "@/components/home/house-strip";
import { Section } from "@/components/section";
import { COVERAGE } from "@/data/coverage";
import {
  calendarFrom,
  electionStatus,
  seatOutlook,
} from "@/data/election-2026";
import { campaign, geo, results } from "@/data/load";
import { formatIsoDate } from "@/lib/format";

const HISTORY = [
  {
    href: "/results",
    title: "Results",
    body: "Every mapped election since 1972 on the map, down to the polling division from 2013.",
  },
  {
    href: "/elections",
    title: "Every election",
    body: "All 17 general elections from 1951 and both referendums, with every candidate’s votes.",
  },
  {
    href: "/trends",
    title: "Trends",
    body: "Party vote, seats and turnout over seventy years.",
  },
  {
    href: "/how-close",
    title: "How close was it?",
    body: "A swing calculator, and where the votes moved in every polling division.",
  },
] as const;

/**
 * The front page: what is happening in 2026 at a glance, find your
 * constituency, who holds each seat, the closest contests, and the way into the history.
 */
export default function FrontPage() {
  const calendar = calendarFrom(campaign);
  const seats = seatOutlook(results, campaign);
  const status = electionStatus(calendar, new Date());
  const past = campaign.events.filter((e) => !e.future);
  const next = campaign.events.find((e) => e.future);
  const highlight = [...past.slice(-2), ...(next ? [next] : [])];

  return (
    <>
      <section className="mx-auto grid max-w-[1240px] items-end gap-x-14 gap-y-6 px-4 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <p className="font-semibold text-el-ink-2 text-xs uppercase tracking-[0.08em]">
            Grenada general election 2026
          </p>
          <h1 className="mt-2.5 font-bold text-[clamp(32px,4.6vw,52px)] leading-[1.05] tracking-[-0.022em]">
            {status}
          </h1>
          <p className="mt-3 max-w-[56ch] font-serif text-el-ink-2 text-lg leading-normal">
            Every constituency, who holds it and who is standing, and every
            result since 1951, with a source for every figure.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              className="inline-flex h-11 items-center rounded-md bg-el-ink px-5 font-semibold text-el-paper hover:opacity-90"
              href="/2026"
            >
              Follow the election →
            </Link>
            <Link
              className="inline-flex h-11 items-center rounded-md border border-el-ink px-5 font-semibold hover:bg-el-paper-2"
              href="/make-your-map"
            >
              Make your map
            </Link>
          </div>
        </div>
        <HouseStrip seats={seats} />
      </section>

      <section
        aria-labelledby="find-title"
        className="mx-auto max-w-[1240px] px-4 pt-10 sm:px-6"
      >
        <div className="border border-el-rule bg-el-paper-2 p-4 sm:p-6">
          <h2 className="font-bold text-xl sm:text-2xl" id="find-title">
            Find your constituency
          </h2>
          <p className="mt-1 text-el-ink-2 text-sm">
            Type your village, a polling station, your constituency or your MP’s
            name.
          </p>
          <ConstituencySearch className="mt-3 max-w-xl" size="large" />
        </div>
      </section>

      <Section
        id="house"
        more={{ href: "/constituencies", label: "All 15 constituencies" }}
        title="Who holds each seat"
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <HouseMap className="max-w-xl" geo={geo} seats={seats} />
          <div>
            <h3 className="font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]">
              Closest contests in 2022 · winning margin
            </h3>
            <div className="mt-2">
              <ClosestContests seats={seats} />
            </div>
          </div>
        </div>
      </Section>

      {COVERAGE.length > 0 && (
        <Section
          id="latest"
          more={{ href: "/2026", label: "All election coverage" }}
          title="Latest"
        >
          <ol className="divide-y divide-el-rule border-el-rule border-y">
            {COVERAGE.slice(0, 3).map((post) => (
              <li className="py-4" key={post.at}>
                <p className="text-el-muted text-xs">
                  {formatIsoDate(post.at.slice(0, 10))}
                </p>
                <h3 className="mt-1 font-bold text-lg">{post.title}</h3>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section
        id="since"
        more={{ href: "/since-2022", label: "Everything since 2022" }}
        title="Since the 2022 election"
      >
        <CampaignTimeline events={highlight} sources={campaign.sources} />
      </Section>

      <Section
        id="constituencies"
        more={{ href: "/constituencies", label: "Constituency pages" }}
        title="All 15 constituencies"
      >
        <ConstituencyGrid seats={seats} />
      </Section>

      <Section id="history" title="How Grenada has voted">
        <nav
          aria-label="Election history"
          className="grid gap-px border border-el-rule bg-el-rule sm:grid-cols-2 lg:grid-cols-4"
        >
          {HISTORY.map((item) => (
            <Link
              className="block bg-background p-4 hover:bg-el-paper-2"
              href={item.href}
              key={item.href}
            >
              <b className="block font-semibold font-serif text-lg">
                {item.title}
              </b>
              <span className="text-el-ink-2 text-sm">{item.body}</span>
            </Link>
          ))}
        </nav>
      </Section>
    </>
  );
}
