import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Climate normals",
  description:
    "What a typical month looks like in Grenada — long-term average rainfall and temperature.",
};

export default function NormalsPage() {
  return (
    <>
      <PageHeader
        description="What a typical month looks like in Grenada."
        title="Climate normals"
      />
      <PlaceholderNotice product="The normals on this page" />
      <PageSection heading="What a normal is">
        <Prose
          paragraphs={[
            "A climate normal is the average of a weather element over a 30-year reference period. Normals describe what is typical — they are not a forecast, and an individual month can depart from them substantially without being unusual in any meaningful sense.",
            "Normals are the baseline against which the monthly climate summary reports whether a month was wetter, drier, warmer or cooler than usual.",
          ]}
        />
      </PageSection>
      <PageSection heading="Normals vary across the island">
        <Prose
          paragraphs={[
            "A normal describes one station, such as Point Salines on the dry southern coast. The interior highlands around Grand Etang receive several times that rainfall, and Carriacou and Petite Martinique are drier than mainland Grenada.",
            "Using a single station's normals for the whole tri-island state will mislead — particularly for rainfall.",
          ]}
        />
      </PageSection>
    </>
  );
}
