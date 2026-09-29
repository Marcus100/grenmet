import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";
import { StatTiles } from "@/components/pages/stat-tiles";

export const metadata = {
  title: "UV index",
  description:
    "How strong the sun is in Grenada today, and how to protect yourself.",
};

export default function UvIndexPage() {
  return (
    <>
      <PageHeader
        description="How strong the sun is today, and how to protect yourself."
        title="UV index"
      />
      <PlaceholderNotice product="The daily UV index" />
      <PageSection heading="Today">
        <StatTiles
          stats={[
            { label: "Peak UV index", value: "11", detail: "Extreme" },
            { label: "Strongest", value: "10 AM – 2 PM", detail: "Seek shade" },
          ]}
        />
      </PageSection>
      <PageSection heading="What the numbers mean">
        <InfoTable
          caption="World Health Organization UV index categories"
          headers={["UV index", "Category", "What to do"]}
          rows={[
            ["0–2", "Low", "Little protection needed"],
            ["3–5", "Moderate", "Shade at midday; hat, sunglasses, sunscreen"],
            [
              "6–7",
              "High",
              "Reduce time in the sun from late morning to mid-afternoon",
            ],
            [
              "8–10",
              "Very high",
              "Take extra precautions; unprotected skin burns quickly",
            ],
            [
              "11+",
              "Extreme",
              "Avoid the midday sun; full protection outdoors",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Why it is so high here">
        <Prose
          paragraphs={[
            "Grenada is only about 12 degrees north of the equator, so the midday sun is high in the sky all year. On a clear day the UV index here commonly reaches very high or extreme levels, even in the drier months.",
            "Cloud and haze lower the index, but thin cloud lets most UV through, and sand and water reflect it back at you. You can burn on an overcast afternoon at the beach.",
          ]}
        />
      </PageSection>
      <PageSection heading="Protect yourself">
        <Checklist
          items={[
            "Plan outdoor work and exercise for early morning or late afternoon.",
            "Use broad-spectrum sunscreen (SPF 30 or higher) and reapply after swimming.",
            "Wear a wide-brimmed hat, sunglasses and light long sleeves.",
            "Keep babies out of direct sun, and drink water often.",
          ]}
        />
      </PageSection>
    </>
  );
}
