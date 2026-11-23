import type { Metadata } from "next";
import Link from "next/link";
import { CampaignTimeline } from "@/components/campaign/timeline";
import { BallotGrid } from "@/components/election/ballot-grid";
import {
  DeclaredSummary,
  DeclaredTable,
} from "@/components/election/declared-result";
import { ElectionHeadline } from "@/components/election/election-headline";
import { ElectionStatus } from "@/components/election/election-status";
import { ElectionTimeline } from "@/components/election/election-timeline";
import { KeyDates } from "@/components/election/key-dates";
import { Flag } from "@/components/flag";
import { ElectionUpdates } from "@/components/home/election-updates";
import { PageHead, Section } from "@/components/section";
import { SourceLink } from "@/components/source-link";
import { COVERAGE } from "@/data/coverage";
import {
  calendarFrom,
  declaredResult,
  seatOutlook,
  updateEvents,
} from "@/data/election-2026";
import { campaign, latestRegister, results } from "@/data/load";
import { nationalResult } from "@/data/model";
import { fmt, formatIsoDate, pct } from "@/lib/format";

export const metadata: Metadata = {
  title: "Election 2026",
  description:
    "Grenada’s 2026 general election: key dates, who is standing in each seat, the latest news and the polls, with a source for everything.",
};

export default function Election2026Page() {
  const calendar = calendarFrom(campaign, results);
  const seats = seatOutlook(results, campaign);
  const declared = declaredResult(results, campaign);
  const last = nationalResult(results, "2022");
  const roll = latestRegister();
  const recent = updateEvents(campaign)
    .filter((e) => !e.future)
    .slice(-3);
  const polls = campaign.polls.filter((p) => p.target === "next");

  return (
    <>
      <div className="mx-auto grid max-w-[1240px] items-end gap-x-14 gap-y-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <PageHead
          deck={
            declared
              ? "Provisional results, key dates and campaign coverage for the 5 November 2026 general election."
              : "Key dates, voter information and campaign coverage for the 5 November general election."
          }
          eyebrow={
            <ElectionStatus
              calendar={calendar}
              prefix="General election 2026"
            />
          }
          learning="election"
          title={
            <ElectionHeadline
              calendar={calendar}
              fallback={
                declared
                  ? "Grenada’s 2026 election: provisional results"
                  : "Grenada’s 2026 election: key dates"
              }
            />
          }
        />
        <div className="flex flex-col gap-5 px-4 sm:px-6">
          <p className="text-el-muted text-base">
            Register snapshot: {formatIsoDate(roll.date)}. These extracted
            records are not a verified final election-day denominator;{" "}
            <Link className="underline" href="/register">
              see the register comparison
            </Link>
            .
          </p>
          <dl className="border-el-rule grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
            {[
              {
                label: "Non-police snapshot",
                value: fmt(roll.electors),
                note: `Consolidated list, ${formatIsoDate(roll.date)}`,
              },
              ...(declared
                ? [
                    {
                      label: "2026 turnout (provisional)",
                      value: pct(declared.turnout),
                    },
                  ]
                : []),
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
                <dt className="text-el-muted text-sm font-semibold tracking-[0.07em] uppercase">
                  {kpi.label}
                </dt>
                <dd className="mt-0.5 text-xl font-semibold tabular-nums">
                  {kpi.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {declared && (
        <Section
          id="results"
          intro="Provisional results from the Parliamentary Elections Office. Margins are the winner’s lead over the runner-up, in votes."
          title="Result in each constituency"
        >
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <DeclaredSummary result={declared} />
            <DeclaredTable seats={declared.seatRows} />
          </div>
        </Section>
      )}

      <Section id="dates" title="Key dates">
        <KeyDates calendar={calendar} />
      </Section>

      <Section
        id="latest"
        intro={
          declared
            ? "Updates from the call of the election to the count, each with its sources."
            : "Updates as the election is called and the campaign runs, each with its sources."
        }
        title="Latest"
      >
        {COVERAGE.length === 0 ? (
          <p className="border-el-rule text-el-ink-2 border-y py-6 leading-relaxed">
            Election-night results will be added only when verified returns are
            available.
          </p>
        ) : (
          <ElectionUpdates
            coverage={COVERAGE}
            events={[]}
            graphics={{
              "election-timeline": <ElectionTimeline calendar={calendar} />,
            }}
            limit={COVERAGE.length}
          />
        )}
      </Section>

      <Section
        id="standing"
        more={{ href: "/candidates", label: "All candidates" }}
        title={
          declared
            ? "Who stood (as reported before polling day)"
            : "Who is standing"
        }
      >
        <BallotGrid seats={seats} />
      </Section>

      <section className="mx-auto max-w-[1240px] px-4 pt-12 sm:px-6">
        <Link
          className="border-el-rule bg-el-paper-2 hover:border-el-ink flex flex-wrap items-center justify-between gap-3 border p-5"
          href={declared ? "/forecast" : "/make-your-map"}
        >
          <span>
            <b className="block font-serif text-xl font-bold">
              {declared ? "The pre-election outlook →" : "Make your map →"}
            </b>
            <span className="text-el-ink-2 text-base">
              {declared
                ? "The model and polls published before polling day, kept as history beside the provisional result."
                : "Rate all 15 constituencies, from Solid NDC to Solid NNP (and DPM where it stands), and share your prediction."}
            </span>
          </span>
        </Link>
      </section>

      <Section
        id="recent"
        more={{ href: "/updates", label: "All updates" }}
        title="Latest updates"
      >
        <CampaignTimeline events={recent} sources={campaign.sources} />
      </Section>

      <Section
        id="polls"
        intro={
          declared
            ? `Published before polling day. The provisional result: ${declared.seats.map(([party, count]) => `${party} ${count}`).join(", ")} seats.`
            : "Grenada has few published polls, and the ones before past elections missed by a wide margin."
        }
        more={{ href: "/forecast", label: "The forecast and every poll" }}
        title={declared ? "Polls before the vote" : "Polls"}
      >
        <ul className="divide-el-rule border-el-rule divide-y border-y">
          {polls.map((poll) => (
            <li className="py-4" key={poll.id}>
              <p className="leading-relaxed font-semibold">
                {poll.pollster}
                <Flag note={poll.note} status={poll.flag} />
              </p>
              <p className="text-el-muted text-base leading-relaxed">
                Fieldwork {poll.field}
                {poll.n ? ` · ${fmt(poll.n)} people` : ""}
                {poll.seats
                  ? ` · ${declared ? "projected" : "projects"} ${Object.entries(
                      poll.seats
                    )
                      .map(([p, n]) => `${p} ${n}`)
                      .join(", ")}`
                  : ""}
              </p>
              <p className="text-el-muted mt-1 text-base leading-relaxed">
                <SourceLink id={poll.src} sources={campaign.sources} />
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
