import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { StatTiles } from "@/components/pages/stat-tiles";

export const metadata = {
  title: "About the Grenada Meteorological Service",
  description:
    "Who we are, what we do, and how the national meteorological service of Grenada, Carriacou and Petite Martinique works.",
};

export default function AboutPage() {
  return (
    <>
      <PageHeader
        description="The national meteorological service of Grenada, Carriacou and Petite Martinique."
        title="About the Grenada Meteorological Service"
      />
      <PageSection heading="What we do">
        <Prose
          paragraphs={[
            "The Grenada Meteorological Service (GMS) observes, forecasts and warns on the weather affecting Grenada, Carriacou and Petite Martinique. It is the country's authoritative source for weather warnings, and the official provider of meteorological services to aviation and marine users.",
            "The service runs the national observing network, issues the daily public forecast and the warnings that follow from it, provides aviation products for Maurice Bishop International Airport, supports the National Disaster Management Agency during high-impact events, and holds the national climate record.",
          ]}
        />
      </PageSection>
      <PageSection heading="At a glance">
        <StatTiles
          stats={[
            {
              label: "Serves",
              value: "Tri-island state",
              detail: "Grenada, Carriacou, Petite Martinique",
            },
            {
              label: "Warning authority",
              value: "National",
              detail: "Official source for weather warnings",
            },
            {
              label: "Aviation",
              value: "TGPY · TGPZ",
              detail: "Point Salines and Lauriston",
            },
            {
              label: "Hurricane season",
              value: "Jun – Nov",
              detail: "1 June to 30 November",
            },
          ]}
        />
      </PageSection>
      <PageSection heading="What we aim to be">
        <Prose
          paragraphs={[
            "Trusted — official, consistent, and traceable to forecaster authority.",
            "Timely — issued on schedule, updated when conditions change, and archived for accountability.",
            "Actionable — built around the decisions people need to make, not only what the weather will be.",
            "Interoperable — machine-readable, standards-compliant, and shareable with regional and international partners.",
            "Resilient — available during high-impact events, when it is needed most.",
          ]}
        />
      </PageSection>
      <PageSection heading="More about the service">
        <LinkList
          links={[
            {
              name: "Contact us",
              href: "/about/contact",
              description: "Office details, enquiries, media and data requests",
            },
            {
              name: "Our history",
              href: "/about/history",
              description: "How meteorology in Grenada developed",
            },
            {
              name: "Our services",
              href: "/about/services",
              description: "The full range of services GMS provides",
            },
            {
              name: "Observing network",
              href: "/about/network",
              description: "Where our observations come from",
            },
            {
              name: "Standards and partners",
              href: "/about/standards",
              description: "WMO, ICAO and regional cooperation",
            },
            {
              name: "Careers",
              href: "/about/careers",
              description: "Working as a meteorologist or met assistant",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
