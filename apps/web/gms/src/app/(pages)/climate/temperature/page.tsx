import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Temperature data",
  description: "Highs, lows and averages by station across Grenada.",
};

export default function TemperaturePage() {
  return (
    <>
      <PageHeader
        description="Highs, lows and averages by station."
        title="Temperature data"
      />
      <PlaceholderNotice product="The temperature figures on this page" />
      <PageSection heading="This month by station">
        <InfoTable
          headers={["Station", "Mean max", "Mean min", "Highest", "Lowest"]}
          rows={[
            ["Point Salines", "31.2 °C", "24.8 °C", "32.8 °C", "23.1 °C"],
            ["St. George's", "31.6 °C", "25.1 °C", "33.4 °C", "23.6 °C"],
            ["Pearls", "31.0 °C", "24.4 °C", "32.6 °C", "22.8 °C"],
            ["Grand Etang", "25.8 °C", "19.9 °C", "27.4 °C", "18.2 °C"],
            [
              "Lauriston, Carriacou",
              "31.4 °C",
              "25.6 °C",
              "33.0 °C",
              "24.2 °C",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Why Grand Etang reads so much cooler">
        <Prose
          paragraphs={[
            "Air temperature falls with height at roughly 6.5 °C per kilometre. Grand Etang sits high in the interior, which puts its readings several degrees below the coastal stations on the same day.",
            "This is why a national heat advisory is framed around the populated coastal areas rather than an island-wide average that no one actually experiences.",
          ]}
        />
      </PageSection>
    </>
  );
}
