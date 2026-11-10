import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { FaqList } from "@/components/pages/faq-list";
import { InfoTable } from "@/components/pages/info-table";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "CAP feeds",
  description:
    "The machine-readable Common Alerting Protocol feeds the Grenada Meteorological Service publishes.",
};

/**
 * The public CAP hub that publishes the alert documents, maps and history.
 * Its feeds are read-only and need no key.
 */
const CAP_HUB = "https://cap.barrels.gd";

export default function CapAlertsPage() {
  return (
    <>
      <PageHeader
        description="The machine-readable alert feeds we publish, for apps, broadcasters and emergency systems."
        title="CAP feeds"
      />
      <PageSection heading="What CAP is">
        <Prose
          paragraphs={[
            "The Common Alerting Protocol (CAP) is an international standard for exchanging public warnings between systems. It is recommended by the World Meteorological Organization, so the same alert can reach phones, radio and TV stations, websites and emergency management tools at the same time, in the same words.",
            "Every alert on our Alerts pages is issued as a CAP message first. The website, the GMS app and these feeds all read from the same source.",
          ]}
        />
      </PageSection>
      <PageSection heading="Our feeds">
        <InfoTable
          caption="Served from this website; both update as soon as an alert is issued, updated or cancelled."
          headers={["Feed", "Address", "Use it for"]}
          monoColumns={[1]}
          rows={[
            [
              "RSS",
              "/api/alerts/rss",
              "Feed readers, newsrooms and alert aggregators",
            ],
            [
              "GeoJSON",
              "/api/alerts/geojson",
              "Maps and GIS tools: the area each active alert covers",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Hub feeds and pages">
        <InfoTable
          caption="Published by the CAP hub at cap.barrels.gd; each updates as alerts are issued, updated or cancelled."
          headers={["What", "Address", "Use it for"]}
          monoColumns={[1]}
          rows={[
            [
              "CAP 1.2 XML (one alert)",
              `${CAP_HUB}/feeds/alerts/<identifier>.xml`,
              "The standard document for each alert; the identifier is on the alert's page",
            ],
            [
              "Active alerts (JSON)",
              `${CAP_HUB}/feeds/latest-active.json`,
              "Alerts in effect, in the same shape as the alert API",
            ],
            [
              "Alerts feed (RSS)",
              `${CAP_HUB}/feeds/rss.xml`,
              "Feed readers and websites that take RSS",
            ],
            [
              "Alert areas (GeoJSON)",
              `${CAP_HUB}/feeds/alerts.geojson`,
              "Mapping tools: each active alert's area",
            ],
            [
              "Alert map",
              `${CAP_HUB}/map`,
              "Where each active alert applies, on a map",
            ],
            [
              "Alert history",
              `${CAP_HUB}/history`,
              "Past alerts, newest first",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Before you build on the feed">
        <Checklist
          items={[
            "Show the alert's headline, severity, area and expiry together; never the headline alone.",
            "Treat a feed you cannot reach as unknown, not as “no alerts”.",
            "Respect updates and cancellations: a newer message replaces the earlier one.",
            "Exercise and test messages are marked as such; never show them as real alerts.",
          ]}
        />
      </PageSection>
      <PageSection heading="Questions">
        <FaqList
          entries={[
            {
              question: "Is there a cost or a key?",
              answer:
                "No. The public feeds are free and need no key. For high-volume or operational use, contact us so we can plan with you.",
            },
            {
              question: "Which alerts are included?",
              answer:
                "Every public alert GMS issues for Grenada, Carriacou and Petite Martinique: weather, marine and hazard warnings, watches and advisories.",
            },
          ]}
        />
      </PageSection>
      <PageSection heading="Related">
        <LinkList
          links={[
            {
              name: "Alerts in effect",
              href: "/alerts",
              description: "What is in effect right now",
            },
            {
              name: "Get alerts",
              href: "/alerts/get-alerts",
              description: "Every channel alerts reach you through",
            },
            {
              name: "Data & API",
              href: "/services/data",
              description: "Our other open data",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
