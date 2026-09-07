import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";
import { StatTiles } from "@/components/pages/stat-tiles";

export const metadata = {
  title: "Sun and moon",
  description:
    "Sunrise, sunset, moon phase and twilight times for Grenada, Carriacou and Petite Martinique.",
};

export default function AlmanacPage() {
  return (
    <>
      <PageHeader
        description="Sunrise, sunset, twilight and moon phase for the tri-island state."
        title="Sun and moon"
      />
      <PlaceholderNotice product="The astronomical times on this page" />
      <PageSection heading="Today — St. George's">
        <StatTiles
          stats={[
            { label: "Sunrise", value: "05:58", detail: "AST" },
            { label: "Sunset", value: "18:12", detail: "AST" },
            { label: "Day length", value: "12 h 14 m" },
            {
              label: "Moon phase",
              value: "Waxing gibbous",
              detail: "68% illuminated",
            },
          ]}
        />
      </PageSection>
      <PageSection heading="Twilight">
        <InfoTable
          headers={["Stage", "Morning", "Evening"]}
          rows={[
            ["Astronomical twilight", "04:46", "19:24"],
            ["Nautical twilight", "05:12", "18:58"],
            ["Civil twilight", "05:36", "18:34"],
          ]}
        />
      </PageSection>
      <PageSection heading="Moon">
        <InfoTable
          headers={["Event", "Date"]}
          rows={[
            ["New moon", "Sample date"],
            ["First quarter", "Sample date"],
            ["Full moon", "Sample date"],
            ["Last quarter", "Sample date"],
          ]}
        />
      </PageSection>
      <PageSection heading="Why these times barely move here">
        <Prose
          paragraphs={[
            "Grenada sits close to 12°N, so day length varies only about an hour across the whole year — from roughly 11 hours 30 minutes at the December solstice to 12 hours 50 minutes in June. There is no long summer evening and no dark winter afternoon.",
            "Twilight is also short at this latitude. The sun drops almost vertically, so the gap between sunset and full darkness is around 20 minutes of civil twilight — useful to know if you are on the water and planning to be back before dark.",
          ]}
        />
      </PageSection>
    </>
  );
}
