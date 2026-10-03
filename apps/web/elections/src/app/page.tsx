import Link from "next/link";
import { ClosestContests } from "@/components/constituencies/closest-contests";
import { HouseMap } from "@/components/constituencies/house-map";
import { ConstituencySearch } from "@/components/constituency-search";
import { ElectionUpdates } from "@/components/home/election-updates";
import { HouseStrip } from "@/components/home/house-strip";
import { HowToVote } from "@/components/home/how-to-vote";
import { RaceInBrief } from "@/components/home/race-in-brief";
import { PageLearning } from "@/components/learn/page-learning";
import { PartyDot } from "@/components/party-chip";
import { Section } from "@/components/section";
import { SourceLink } from "@/components/source-link";
import { COVERAGE } from "@/data/coverage";
import {
  calendarFrom,
  electionStatus,
  seatOutlook,
} from "@/data/election-2026";
import { GUIDES } from "@/data/learning";
import { campaign, geo, results } from "@/data/load";
import { nationalResult } from "@/data/model";
import { formatIsoDate } from "@/lib/format";

const HISTORY = [
  {
    href: "/results",
    title: "Results",
    body: "Results since 1951, maps from 1972, and polling divisions from 2013.",
  },
  {
    href: "/elections",
    title: "Every election",
    body: "All 17 general elections from 1951 and both referendums, with every candidate’s votes.",
  },
  {
    href: "/trends",
    title: "Trends",
    body: "Learn why votes, seats and turnout tell different stories.",
  },
  {
    href: "/how-close",
    title: "How close was it?",
    body: "A swing calculator, and where the votes moved in every polling division.",
  },
] as const;

const LABEL =
  "font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]";

/**
 * The front page, laid out like an election hub before polling day: the
 * state of the race, the seats that decide it, the forecast, how to vote,
 * and the way into the history.
 */
export default function FrontPage() {
  const calendar = calendarFrom(campaign);
  const seats = seatOutlook(results, campaign);
  const status = electionStatus(calendar, new Date());
  const result2022 = nationalResult(results, "2022");
  const crossed = seats.filter((s) => s.sitting.was);

  // Three slots: once Parliament is dissolved, that date replaces nomination
  // day until nomination day is proclaimed.
  const dates = [
    calendar.dissolved && !calendar.nominationDay
      ? {
          label: "Parliament dissolved",
          value: formatIsoDate(calendar.dissolved),
        }
      : {
          label: "Nomination day",
          value: calendar.nominationDay
            ? formatIsoDate(calendar.nominationDay)
            : "To be proclaimed",
        },
    {
      label: "Announcement expected",
      value: formatIsoDate(calendar.announcement),
    },
    {
      label: "Polling day",
      value: calendar.pollingDay
        ? formatIsoDate(calendar.pollingDay)
        : "To be announced",
    },
  ];

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
            Parliament was dissolved on 2 October. Fifteen seats, eight for a
            majority. The NDC won nine in 2022; one member has since crossed to
            the government and another now leads a new party, the DPM.
          </p>
          <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap">
            <Link
              className="inline-flex h-11 items-center justify-center rounded-md bg-el-ink px-5 font-semibold text-el-paper hover:opacity-90"
              href="/make-your-map"
            >
              Make your own map →
            </Link>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-md border border-el-ink px-5 font-semibold hover:bg-el-paper-2"
              href="/learn"
            >
              Understand the election
            </Link>
          </div>
        </div>
        <div className="space-y-4">
          <HouseStrip seats={seats} />
          <dl className="grid grid-cols-3 gap-3 border-el-rule border-t pt-3">
            {dates.map((d) => (
              <div key={d.label}>
                <dt className={LABEL}>{d.label}</dt>
                <dd className="mt-0.5 font-semibold font-serif leading-tight">
                  {d.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <PageLearning topic="election" />
      </div>
      <Section
        id="start-learning"
        intro="Follow the election with the knowledge to interpret it. Start with one question."
        more={{ href: "/learn", label: "All learning guides" }}
        title="Understand what happens next"
      >
        <div className="grid gap-6 md:grid-cols-3">
          {GUIDES.slice(0, 3).map((guide) => (
            <article className="border-el-rule border-t pt-4" key={guide.slug}>
              <h3 className="font-bold font-serif text-xl">
                <Link className="hover:underline" href={`/learn/${guide.slug}`}>
                  {guide.question}
                </Link>
              </h3>
              <p className="mt-2 text-el-ink-2 text-sm leading-relaxed">
                {guide.answer}
              </p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        id="updates"
        more={{ href: "/since-2022", label: "All updates" }}
        title="Election updates"
      >
        <ElectionUpdates
          coverage={COVERAGE}
          events={campaign.events}
          sources={campaign.sources}
        />
      </Section>

      <Section
        id="race"
        more={{ href: "/candidates", label: "Who is standing" }}
        title="The race in brief"
      >
        <RaceInBrief
          campaign={campaign}
          result2022={result2022}
          seats={seats}
        />
      </Section>

      <Section
        id="watch"
        more={{ href: "/constituencies", label: "All 15 constituencies" }}
        title="Seats to watch"
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <HouseMap className="max-w-xl" geo={geo} seats={seats} />
          <div className="space-y-6">
            <div>
              <h3 className={LABEL}>Closest in 2022 · winning margin</h3>
              <div className="mt-2">
                <ClosestContests count={4} seats={seats} />
              </div>
            </div>
            {crossed.length > 0 && (
              <div>
                <h3 className={LABEL}>Changed hands since 2022</h3>
                <ul className="mt-2 divide-y divide-el-rule border-el-rule border-y text-sm">
                  {crossed.map((s) => (
                    <li className="py-2.5" key={s.code}>
                      <Link
                        className="font-semibold font-serif hover:underline"
                        href={s.href}
                      >
                        {s.name}
                      </Link>
                      <span className="block text-el-muted text-xs">
                        <PartyDot party={s.sitting.party} />
                        {s.sitting.name}: elected {s.sitting.was} in 2022, now{" "}
                        {s.sitting.party}
                        {campaign.sitting[s.code] && (
                          <>
                            {" · "}
                            <SourceLink
                              id={campaign.sitting[s.code]?.src ?? ""}
                              sources={campaign.sources}
                            />
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section
        id="experiments"
        more={{
          href: "/learn/polls-and-predictions",
          label: "Learn about uncertainty",
        }}
        title="Test an idea, understand the uncertainty"
      >
        <p className="max-w-prose text-el-ink-2 leading-relaxed">
          What changes when support moves between parties? Explore a scenario,
          inspect the assumptions, and compare it with recorded results. A
          model’s output is not an official prediction.
        </p>
        <div className="mt-4 flex flex-wrap gap-5">
          <Link className="underline underline-offset-4" href="/how-close">
            Try the swing calculator
          </Link>
          <Link className="underline underline-offset-4" href="/make-your-map">
            Make your map
          </Link>
          <Link className="underline underline-offset-4" href="/forecast">
            Inspect the model and its backtests
          </Link>
        </div>
      </Section>

      <Section id="vote" title="Your vote">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="border border-el-rule bg-el-paper-2 p-4 sm:p-6">
            <h3 className="font-bold text-xl">Find your constituency</h3>
            <p className="mt-1 text-el-ink-2 text-sm">
              Type your village, a polling station, your constituency or your
              MP’s name.
            </p>
            <ConstituencySearch className="mt-3" size="large" />
          </div>
          <div>
            <h3 className="font-bold text-xl">How to register</h3>
            <div className="mt-2">
              <HowToVote />
            </div>
          </div>
        </div>
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
