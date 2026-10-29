import type { Metadata } from "next";
import { CampaignTimeline } from "@/components/campaign/timeline";
import { PageHead, Section } from "@/components/section";
import { updateEvents } from "@/data/election-2026";
import { campaign } from "@/data/load";
import { formatIsoDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Updates",
  description:
    "Dated campaign updates and sources from 18 September 2026 onward.",
};

export default function UpdatesPage() {
  return (
    <>
      <PageHead
        deck="A dated record of campaign announcements. Read the latest election overview for current arrangements."
        eyebrow={`Updated ${formatIsoDate(campaign.updated)}`}
        learning="election"
        title="Updates"
      />
      <Section id="timeline" title="Timeline">
        <CampaignTimeline
          events={updateEvents(campaign)}
          sources={campaign.sources}
        />
      </Section>
    </>
  );
}
