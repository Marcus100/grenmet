import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Get alerts",
  description:
    "How to receive weather warnings from the Grenada Meteorological Service.",
};

export default function SubscribePage() {
  return (
    <>
      <PageHeader
        description="How to receive warnings, and which channel to rely on."
        title="Get alerts"
      />
      <PlaceholderNotice product="The subscription channels on this page" />
      <PageSection heading="Channels">
        <InfoTable
          headers={["Channel", "Best for", "Works without power?"]}
          rows={[
            ["This website", "Full detail and the current picture", "No"],
            [
              "WhatsApp channel",
              "Fast notification on the phone you already check",
              "No",
            ],
            ["Social media", "Reach and sharing", "No"],
            [
              "Radio",
              "Reaching everyone during an outage",
              "Yes, with a battery radio",
            ],
            ["CAP feed", "Broadcasters, agencies and app developers", "No"],
            ["Email digest", "Daily summaries rather than urgent alerts", "No"],
          ]}
        />
      </PageSection>
      <PageSection heading="Do not rely on one channel">
        <Prose
          paragraphs={[
            "Every digital channel depends on power and on the mobile network — the two things a severe event takes out first. A battery or wind-up radio is the one channel that keeps working when the rest fail, and every household should have one.",
            "Treat phone alerts as the fast channel and radio as the reliable one. Neither replaces the other.",
          ]}
        />
      </PageSection>
      <PageSection heading="For developers">
        <Prose
          paragraphs={[
            "Warnings are published in the Common Alerting Protocol, a structured international standard designed for machine consumption. Any app, broadcaster or agency system can consume the feed directly rather than scraping this website.",
            "Exercise and test messages are flagged in the feed, so a well-built consumer can suppress or label them automatically.",
          ]}
        />
      </PageSection>
    </>
  );
}
