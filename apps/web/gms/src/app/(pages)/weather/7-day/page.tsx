import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "7-day outlook",
  description: "The week ahead for the tri-island state, updated each morning.",
};

export default function SevenDayPage() {
  return (
    <>
      <PageHeader
        description="The week ahead, updated each morning."
        title="7-day outlook"
      />
      <PlaceholderNotice product="The 7-day outlook" />
      <PageSection>
        <InfoTable
          headers={["Day", "Outlook", "High", "Low", "Rain chance"]}
          rows={[
            ["Monday", "Sunny intervals", "31 °C", "25 °C", "30%"],
            ["Tuesday", "Cloudy periods", "30 °C", "25 °C", "50%"],
            ["Wednesday", "Showers, heavy at times", "29 °C", "24 °C", "70%"],
            ["Thursday", "Scattered showers", "30 °C", "25 °C", "50%"],
            ["Friday", "Sunny intervals", "31 °C", "25 °C", "30%"],
            ["Saturday", "Mostly sunny", "31 °C", "26 °C", "20%"],
            ["Sunday", "Sunny intervals", "31 °C", "26 °C", "30%"],
          ]}
        />
      </PageSection>
      <PageSection heading="How far ahead this is useful">
        <Prose
          paragraphs={[
            "Days one to three carry the most confidence. Days four to seven show the general pattern — whether the week trends wetter or drier — and should not be read as a firm forecast for a specific day.",
            "Confidence drops fastest for rainfall. Temperature and wind direction hold up better across the full week.",
          ]}
        />
      </PageSection>
    </>
  );
}
