import { PageHeader } from "@/components/page-header";
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
      <PlaceholderNotice
        product="The 7-day outlook"
        source={{ href: "/weather", label: "the daily forecast" }}
      />
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
