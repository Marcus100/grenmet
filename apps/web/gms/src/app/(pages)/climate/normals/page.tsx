import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
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
      <PageSection heading="Point Salines — monthly normals">
        <InfoTable
          caption="Long-term averages. Sample values pending publication of the official normals."
          headers={["Month", "Mean max", "Mean min", "Rainfall", "Rain days"]}
          rows={[
            ["January", "29.8 °C", "23.4 °C", "104 mm", "15"],
            ["February", "30.0 °C", "23.2 °C", "63 mm", "11"],
            ["March", "30.5 °C", "23.5 °C", "45 mm", "9"],
            ["April", "31.0 °C", "24.2 °C", "52 mm", "9"],
            ["May", "31.2 °C", "25.0 °C", "104 mm", "12"],
            ["June", "30.8 °C", "25.1 °C", "203 mm", "19"],
            ["July", "30.6 °C", "24.8 °C", "231 mm", "21"],
            ["August", "30.9 °C", "24.8 °C", "225 mm", "20"],
            ["September", "31.0 °C", "24.6 °C", "196 mm", "18"],
            ["October", "30.8 °C", "24.4 °C", "197 mm", "18"],
            ["November", "30.4 °C", "24.2 °C", "205 mm", "18"],
            ["December", "30.0 °C", "23.7 °C", "146 mm", "17"],
          ]}
        />
      </PageSection>
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
            "The figures above are for Point Salines on the dry southern coast. The interior highlands around Grand Etang receive several times that rainfall, and Carriacou and Petite Martinique are drier than mainland Grenada.",
            "Using a single station's normals for the whole tri-island state will mislead — particularly for rainfall.",
          ]}
        />
      </PageSection>
    </>
  );
}
