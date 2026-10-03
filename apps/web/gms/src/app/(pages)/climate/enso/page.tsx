import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "El Niño and La Niña",
  description: "How the tropical Pacific shapes Grenada's seasons.",
};

export default function EnsoPage() {
  return (
    <>
      <PageHeader
        description="How the Pacific shapes our seasons."
        title="El Niño & La Niña"
      />
      <PageSection heading="Current status">
        <PlaceholderNotice compact product="The ENSO status" />
        <Prose paragraphs={["ENSO-neutral: neither El Niño nor La Niña."]} />
      </PageSection>
      <PageSection heading="What they are">
        <Prose
          paragraphs={[
            "El Niño and La Niña are the warm and cool phases of a natural cycle in the tropical Pacific Ocean, the El Niño–Southern Oscillation (ENSO). They change wind patterns far beyond the Pacific, including over the Caribbean, and each phase usually lasts from several months to a year or more.",
          ]}
        />
      </PageSection>
      <PageSection heading="What each usually means for Grenada">
        <InfoTable
          headers={["Phase", "Rainfall", "Hurricane season"]}
          rows={[
            [
              "El Niño",
              "Often drier, especially later in the rainy season; greater drought risk",
              "Stronger upper-level winds tend to suppress Atlantic hurricanes",
            ],
            [
              "La Niña",
              "Often wetter",
              "Tends to favour a more active Atlantic season",
            ],
            ["Neutral", "Other factors dominate", "Other factors dominate"],
          ]}
        />
        <p className="mt-3 max-w-prose text-body text-gm-text-secondary leading-body">
          These are tendencies, not rules: a quiet El Niño year can still bring
          a damaging storm.
        </p>
      </PageSection>
      <PageSection heading="Related">
        <LinkList
          links={[
            {
              name: "Seasonal outlook",
              href: "/climate/seasonal",
              description: "Rainfall and temperature for the months ahead",
            },
            {
              name: "Drought status",
              href: "/climate/drought",
              description: "Dry-spell status across the tri-island state",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
