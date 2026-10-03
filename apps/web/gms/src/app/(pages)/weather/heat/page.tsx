import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";
import { StatTiles } from "@/components/pages/stat-tiles";

export const metadata = {
  title: "Heat index",
  description:
    "How hot it feels in Grenada, and when heat becomes a health risk.",
};

export default function HeatIndexPage() {
  return (
    <>
      <PageHeader
        description="How hot it feels, and when to take care."
        title="Heat index"
      />
      <PlaceholderNotice product="The daily heat index" />
      <PageSection heading="Today">
        <StatTiles
          stats={[
            {
              label: "Feels like at midday",
              value: "38°C",
              detail: "Extreme caution",
            },
            { label: "Air temperature", value: "31°C" },
            { label: "Humidity", value: "70%" },
          ]}
        />
      </PageSection>
      <PageSection heading="What the heat index is">
        <Prose
          paragraphs={[
            "The heat index combines air temperature and humidity into a single “feels like” temperature. Your body cools by sweating; in humid air, sweat evaporates slowly, so you feel hotter than the thermometer reads.",
            "In Grenada's humid climate, a 31°C afternoon can feel like the high 30s. Direct sunshine can add several degrees more.",
          ]}
        />
      </PageSection>
      <PageSection heading="Heat index levels">
        <InfoTable
          headers={[
            "Feels like",
            "Level",
            "Risk with long exposure or activity",
          ]}
          rows={[
            ["27–32°C", "Caution", "Fatigue is possible"],
            [
              "32–41°C",
              "Extreme caution",
              "Heat cramps and heat exhaustion possible",
            ],
            [
              "41–54°C",
              "Danger",
              "Heat cramps and exhaustion likely; heat stroke possible",
            ],
            ["Above 54°C", "Extreme danger", "Heat stroke highly likely"],
          ]}
        />
      </PageSection>
      <PageSection heading="Stay safe">
        <LinkList
          links={[
            {
              name: "Heat: prepare",
              href: "/alerts/prepare/heat",
              description: "Keeping cool on the hottest days",
            },
            {
              name: "UV index",
              href: "/weather/uv",
              description: "How strong the sun is today",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
