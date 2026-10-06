import type { Metadata } from "next";
import { CampaignTimeline } from "@/components/campaign/timeline";
import { HouseMap } from "@/components/constituencies/house-map";
import { PageHead, Section } from "@/components/section";
import { seatOutlook, updateEvents } from "@/data/election-2026";
import { campaign, geo, results } from "@/data/load";
import { formatIsoDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Updates",
  description:
    "Every update on Grenada’s 2026 general election since 18 September: candidates, the dissolution, the writs and polling day, each with its source.",
};

export default function UpdatesPage() {
  const seats = seatOutlook(results, campaign);

  return (
    <>
      <PageHead
        deck="The road to polling day, from 18 September. Every item links to its source; ✱ marks items that still need an official or primary source."
        eyebrow={`Updated ${formatIsoDate(campaign.updated)}`}
        learning="election"
        title="Updates"
      />
      <Section id="timeline" title="Timeline">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <CampaignTimeline
            events={updateEvents(campaign)}
            sources={campaign.sources}
          />
          <div>
            <h3 className="mb-2 font-semibold text-el-muted text-sm uppercase tracking-[0.07em]">
              The House today
            </h3>
            <HouseMap geo={geo} seats={seats} />
            <p className="mt-2 text-base text-el-muted leading-relaxed">
              Seats changed hands by floor crossing and resignation from the
              party, not by by-election. 2022 result: NDC 9, NNP 6.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
