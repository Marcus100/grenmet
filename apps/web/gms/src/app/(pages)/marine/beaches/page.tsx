import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { InfoTable } from "@/components/pages/info-table";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Beach conditions",
  description:
    "Surf, sun and safety for popular beaches in Grenada, Carriacou and Petite Martinique.",
};

export default function BeachesPage() {
  return (
    <>
      <PageHeader
        description="Surf, sun and safety at popular beaches."
        title="Beach conditions"
      />
      <PlaceholderNotice product="Beach-by-beach conditions" />
      <PageSection heading="Today by beach">
        <InfoTable
          headers={["Beach", "Coast", "Surf", "Notes"]}
          rows={[
            [
              "Grand Anse",
              "South-west",
              "Calm",
              "Sheltered; UV extreme after 10 AM",
            ],
            ["Morne Rouge", "South-west", "Calm", "Sheltered bay"],
            [
              "La Sagesse",
              "South-east",
              "Moderate",
              "Swell wraps into the bay",
            ],
            [
              "Bathway",
              "North-east",
              "Rough",
              "Reef-protected pool; open water beyond is dangerous",
            ],
            [
              "Levera",
              "North-east",
              "Rough",
              "Atlantic swell; strong currents",
            ],
            [
              "Paradise Beach, Carriacou",
              "West",
              "Calm",
              "Sheltered from the trade winds",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Reading the coast">
        <Prose
          paragraphs={[
            "The trade winds blow from the east for most of the year, so beaches on the south-west and west coasts are usually calmer, while the Atlantic-facing north-east and east coasts take the swell.",
            "That pattern can flip. Some tropical waves and storms bring winds and swell from the south or west, and distant Atlantic storms can send long-period swell to every coast on a calm, sunny day.",
          ]}
        />
      </PageSection>
      <PageSection heading="Before you swim">
        <Checklist
          items={[
            "Check for small craft advisories and high-surf alerts first.",
            "Swim where others are swimming, and never alone.",
            "If you are caught in a rip current, swim parallel to the shore, then back in.",
            "Keep children within arm's reach, even in calm water.",
          ]}
        />
      </PageSection>
      <PageSection heading="Related">
        <LinkList
          links={[
            {
              name: "Rip currents",
              href: "/marine/safety/rip-currents",
              description: "Spotting and escaping a rip",
            },
            {
              name: "UV index",
              href: "/weather/uv",
              description: "How strong the sun is today",
            },
            {
              name: "Sargassum outlook",
              href: "/marine/sargassum",
              description: "Where seaweed may reach the coast",
            },
            {
              name: "Tides",
              href: "/marine/tides",
              description: "Predicted high and low water",
            },
          ]}
        />
      </PageSection>
    </>
  );
}
