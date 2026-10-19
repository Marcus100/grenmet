import { PageHeader } from "@/components/page-header";
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
