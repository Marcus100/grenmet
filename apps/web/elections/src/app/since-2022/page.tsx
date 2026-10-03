import type { Metadata } from "next";
import { CampaignTimeline } from "@/components/campaign/timeline";
import { HouseMap } from "@/components/constituencies/house-map";
import { PageHead, Section } from "@/components/section";
import { seatOutlook } from "@/data/election-2026";
import { campaign, geo, results } from "@/data/load";
import { formatIsoDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Since the 2022 election",
  description:
    "What has changed in Grenada’s politics since the June 2022 general election: floor crossings, new leaders, a new party and the road to 2026.",
};

export default function Since2022Page() {
  const seats = seatOutlook(results, campaign);

  return (
    <>
      <PageHead
        deck="Floor crossings, new leaders, a new party and the road to polling day. Every item links to its source; ✱ marks items that still need an official or primary source."
        eyebrow={`Updated ${formatIsoDate(campaign.updated)}`}
        learning="election"
        title="Since the 2022 election"
      />
      <Section id="timeline" title="Timeline">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <CampaignTimeline
            events={campaign.events}
            sources={campaign.sources}
          />
          <div>
            <h3 className="mb-2 font-semibold text-[11px] text-el-muted uppercase tracking-[0.07em]">
              The House today
            </h3>
            <HouseMap geo={geo} seats={seats} />
            <p className="mt-2 text-el-muted text-xs">
              Seats changed hands by floor crossing and resignation from the
              party, not by by-election. 2022 result: NDC 9, NNP 6.
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}
