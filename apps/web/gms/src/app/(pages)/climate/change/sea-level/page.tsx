import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Sea level",
  description: "Rising seas around Grenada, Carriacou and Petite Martinique.",
};

export default function SeaLevelPage() {
  return (
    <>
      <PageHeader
        description="Rising seas around the islands."
        title="Sea level"
      />
      <PageSection heading="Why the sea is rising">
        <Prose
          paragraphs={[
            "Global sea level is rising because ocean water expands as it warms and because glaciers and ice sheets are melting. Satellite measurements show it rising by a few millimetres a year, and faster now than a few decades ago.",
            "A few millimetres a year adds up. Over decades it means higher tides, more frequent flooding of low-lying roads and coasts, and storm surge that reaches further inland.",
          ]}
        />
      </PageSection>
      <PageSection heading="Where it matters most here">
        <Checklist
          items={[
            "Low-lying parts of St. George's, including the Carenage.",
            "Coastal roads and settlements on the east and south coasts.",
            "Carriacou and Petite Martinique, where much of the community and infrastructure sits close to the shore.",
            "Beaches, which erode faster as waves reach higher up the shore.",
          ]}
        />
      </PageSection>
    </>
  );
}
