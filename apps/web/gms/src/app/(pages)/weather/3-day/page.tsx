import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "3-day forecast",
  description:
    "The next three days for Grenada, Carriacou and Petite Martinique.",
};

export default function ThreeDayPage() {
  return (
    <>
      <PageHeader
        description="The next three days at a glance."
        title="3-day forecast"
      />
      <PlaceholderNotice product="The 3-day forecast" />
      <PageSection heading="Grenada">
        <InfoTable
          headers={["Day", "Outlook", "High", "Low", "Wind", "Rain chance"]}
          rows={[
            [
              "Today",
              "Sunny intervals, isolated showers",
              "31 °C",
              "25 °C",
              "NE 14 kt",
              "30%",
            ],
            [
              "Tomorrow",
              "Cloudy periods, scattered showers",
              "30 °C",
              "25 °C",
              "ENE 16 kt",
              "50%",
            ],
            [
              "Day 3",
              "Showers, some heavy at times",
              "29 °C",
              "24 °C",
              "E 12 kt",
              "70%",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Carriacou and Petite Martinique">
        <InfoTable
          headers={["Day", "Outlook", "High", "Low", "Wind", "Rain chance"]}
          rows={[
            ["Today", "Mostly sunny", "31 °C", "26 °C", "NE 16 kt", "20%"],
            [
              "Tomorrow",
              "Sunny intervals",
              "31 °C",
              "26 °C",
              "ENE 18 kt",
              "30%",
            ],
            ["Day 3", "Scattered showers", "30 °C", "25 °C", "E 14 kt", "50%"],
          ]}
        />
      </PageSection>
      <PageSection heading="Issue schedule">
        <Prose
          paragraphs={[
            "The 3-day forecast is issued twice daily at 06:00 and 18:00 AST, and amended whenever conditions change materially.",
          ]}
        />
      </PageSection>
    </>
  );
}
