import { PageHeader } from "@/components/page-header";
import { FaqList } from "@/components/pages/faq-list";
import { InfoTable } from "@/components/pages/info-table";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Website help",
  description:
    "How to read the warning levels, the forecast and the other features of this site.",
};

export default function HelpPage() {
  return (
    <>
      <PageHeader
        description="How to read the warning levels, the forecast and the rest of this site."
        title="Website help"
      />
      <PageSection heading="Warning colours">
        <InfoTable
          headers={["Colour", "Level", "What it asks of you"]}
          rows={[
            [
              "Green",
              "No warning in effect",
              "Nothing — conditions are within the normal range",
            ],
            ["Yellow", "Advisory", "Be aware and monitor updates"],
            ["Amber", "Watch", "Prepare and review your plans"],
            ["Red", "Warning", "Take protective action now"],
          ]}
        />
      </PageSection>
      <PageSection heading="Reading the alerts panel">
        <Prose
          paragraphs={[
            "Alerts are grouped by hazard and, within each hazard, listed most severe first. The coloured dot beside each alert shows its severity.",
            "If the alerts panel says warning information cannot be retrieved, that means the feed is unreachable — not that there are no warnings. Check with the Grenada Meteorological Service directly if you need certainty.",
          ]}
        />
      </PageSection>
      <PageSection heading="Reading the forecast">
        <Prose
          paragraphs={[
            "The date strip moves between days. Each day shows expected conditions, the high and low, and wind.",
            "Rain chance is the likelihood that measurable rain falls at a given point in the forecast area — not how long it will rain or how heavy it will be. A 30% chance on a showery day in Grenada is normal, not a washout.",
            "Sample content notices appear on pages whose product is not yet issued from the operational forecast system. Those figures are illustrative and must not be used for any real decision.",
          ]}
        />
      </PageSection>
      <PageSection heading="Common questions">
        <FaqList
          entries={[
            {
              question: "Which page should I check during a storm?",
              answer:
                "Current alerts, at /warnings. It lists everything in effect, grouped by hazard, and is the page that updates first.",
            },
            {
              question: "How do I find weather for a specific day?",
              answer:
                "Use the date strip on the home page to move between days, or open the 3-day forecast or 7-day outlook.",
            },
            {
              question: "Where do I find data rather than forecasts?",
              answer:
                "Climate and data covers rainfall, temperature, normals and historical records, and explains how to request data that is not published.",
            },
            {
              question: "Is this the official source?",
              answer:
                "Yes. This is the Grenada Meteorological Service, the official source of weather warnings for Grenada, Carriacou and Petite Martinique. During an event, prefer this site and the official feed over social media reposts.",
            },
          ]}
        />
      </PageSection>
      <PageSection heading="Getting more help">
        <LinkList
          links={[
            {
              name: "Understanding warnings",
              href: "/resources/warnings-guide",
              description: "How to read a warning and act on it",
            },
            {
              name: "Warning levels explained",
              href: "/warnings/levels",
              description: "How the green-to-red scale works",
            },
            {
              name: "Weather glossary",
              href: "/resources/glossary",
              description: "The terms used in forecasts and warnings",
            },
            {
              name: "Contact us",
              href: "/about/contact",
              description: "Reach the service directly",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
