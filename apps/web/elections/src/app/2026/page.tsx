import type { Metadata } from "next";
import Link from "next/link";
import { CampaignTimeline } from "@/components/campaign/timeline";
import { BallotGrid } from "@/components/election/ballot-grid";
import { KeyDates } from "@/components/election/key-dates";
import { Flag } from "@/components/flag";
import { ElectionUpdates } from "@/components/home/election-updates";
import { HouseStrip } from "@/components/home/house-strip";
import { PageHead, Section } from "@/components/section";
import { SourceLink } from "@/components/source-link";
import { COVERAGE } from "@/data/coverage";
import {
  calendarFrom,
  daysUntil,
  electionStatus,
  seatOutlook,
} from "@/data/election-2026";
import { campaign, latestRegister, results } from "@/data/load";
import { nationalResult } from "@/data/model";
import { fmt, formatIsoDate, pct } from "@/lib/format";

export const metadata: Metadata = {
  title: "Election 2026",
  description:
    "Grenada’s 2026 general election: key dates, who is standing in each seat, the latest news and the polls, with a source for everything.",
};

/** The headline follows the election: the date to come, then polling day. */
function leadTitle(
  announcement: string,
  pollingDay: string | null,
  announceIn: number
): string {
  if (pollingDay) return `Grenada votes on ${formatIsoDate(pollingDay)}`;
  if (announceIn >= 0)
    return `Grenada’s election date is due on ${formatIsoDate(announcement)}`;
  return "Grenada waits for its election date";
}

export default function Election2026Page() {
  const now = new Date();
  const calendar = calendarFrom(campaign);
  const seats = seatOutlook(results, campaign);
  const last = nationalResult(results, "2022");
  const roll = latestRegister();
  const recent = campaign.events.filter((e) => !e.future).slice(-3);
  const polls = campaign.polls.filter((p) => p.target === "next");

  return (
    <>
      <div className="mx-auto grid max-w-[1240px] items-end gap-x-14 gap-y-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <PageHead
          deck="Parliament was dissolved on 2 October, so the election must be held by early January. The Prime Minister is due to name polling day at an event in St. Mark. The NDC won 9 of 15 seats in 2022; since then one NNP member has crossed to the government and another has formed the DPM."
          eyebrow={`General election 2026 · ${electionStatus(calendar, now)}`}
          learning="election"
          title={leadTitle(
            calendar.announcement,
            calendar.pollingDay,
            daysUntil(calendar.announcement, now)
          )}
        />
        <div className="flex flex-col gap-5 px-4 sm:px-6">
          <HouseStrip seats={seats} />
          <dl className="grid grid-cols-2 gap-3 border-el-rule border-t pt-3 sm:grid-cols-4">
            {[
              {
                label: "On the roll",
                value: fmt(roll.electors),
                note: `Consolidated list, ${formatIsoDate(roll.date)}`,
              },
              { label: "2022 turnout", value: pct(last.turnout) },
              {
                label: "2022 NDC vote",
                value: pct((last.votes.NDC ?? 0) / last.total),
              },
              {
                label: "2022 NNP vote",
                value: pct((last.votes.NNP ?? 0) / last.total),
              },
            ].map((kpi) => (
              <div key={kpi.label} title={kpi.note}>
                <dt className="font-semibold text-el-muted text-sm uppercase tracking-[0.07em]">
                  {kpi.label}
                </dt>
                <dd className="mt-0.5 font-semibold text-xl tabular-nums">
                  {kpi.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <Section id="dates" title="Key dates">
        <KeyDates calendar={calendar} />
      </Section>

      <Section
        id="latest"
        intro="Updates as the election is called and the campaign runs, each with its sources."
        title="Latest"
      >
        {COVERAGE.length === 0 ? (
          <p className="border-el-rule border-y py-6 text-el-ink-2 leading-relaxed">
            Live coverage starts when polling day is announced.
          </p>
        ) : (
          <ElectionUpdates
            coverage={COVERAGE}
            events={[]}
            limit={COVERAGE.length}
            sources={campaign.sources}
          />
        )}
      </Section>

      <Section
        id="standing"
        more={{ href: "/candidates", label: "All candidates" }}
        title="Who is standing"
      >
        <BallotGrid seats={seats} />
      </Section>

      <section className="mx-auto max-w-[1240px] px-4 pt-12 sm:px-6">
        <Link
          className="flex flex-wrap items-center justify-between gap-3 border border-el-rule bg-el-paper-2 p-5 hover:border-el-ink"
          href="/make-your-map"
        >
          <span>
            <b className="block font-bold font-serif text-xl">
              Make your map →
            </b>
            <span className="text-base text-el-ink-2">
              Rate all 15 constituencies, from Solid NDC to Solid NNP (and DPM
              where it stands), and share your prediction.
            </span>
          </span>
        </Link>
      </section>

      <Section
        id="recent"
        more={{ href: "/since-2022", label: "Everything since 2022" }}
        title="Since the 2022 election"
      >
        <CampaignTimeline events={recent} sources={campaign.sources} />
      </Section>

      <Section
        id="polls"
        intro="Grenada has few published polls, and the ones before past elections missed by a wide margin."
        more={{ href: "/forecast", label: "The forecast and every poll" }}
        title="Polls"
      >
        <ul className="divide-y divide-el-rule border-el-rule border-y">
          {polls.map((poll) => (
            <li className="py-4" key={poll.id}>
              <p className="font-semibold leading-relaxed">
                {poll.pollster}
                <Flag note={poll.note} status={poll.flag} />
              </p>
              <p className="text-base text-el-muted leading-relaxed">
                Fieldwork {poll.field}
                {poll.n ? ` · ${fmt(poll.n)} people` : ""}
                {poll.seats
                  ? ` · projects ${Object.entries(poll.seats)
                      .map(([p, n]) => `${p} ${n}`)
                      .join(", ")}`
                  : ""}
              </p>
              <p className="mt-1 text-base text-el-muted leading-relaxed">
                <SourceLink id={poll.src} sources={campaign.sources} />
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
