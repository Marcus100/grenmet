import { PageHeader } from "@/components/page-header";
import { ImageryFrame } from "@/components/pages/imagery-frame";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Satellite",
  description: "Cloud and storm systems across the Eastern Caribbean.",
};

export default function SatellitePage() {
  return (
    <>
      <PageHeader
        description="Cloud and storms across the region."
        title="Satellite"
      />
      <PlaceholderNotice product="Satellite imagery" />
      <PageSection>
        <div className="grid gap-4 lg:grid-cols-2">
          <ImageryFrame
            caption="Visible — daylight hours only"
            label="Visible channel imagery will appear here once a feed is connected."
          />
          <ImageryFrame
            caption="Infrared — available day and night"
            label="Infrared channel imagery will appear here once a feed is connected."
          />
        </div>
      </PageSection>
      <PageSection heading="Reading the two channels">
        <Prose
          paragraphs={[
            "The visible channel shows sunlight reflected from cloud tops, so it is only useful in daylight. Thick cloud appears bright, thin cloud appears grey.",
            "The infrared channel measures temperature and works around the clock. The coldest tops appear brightest, which is how the tallest and most active storm cells are identified overnight.",
            "Satellite imagery for the Eastern Caribbean comes from the GOES series operated by NOAA.",
          ]}
        />
      </PageSection>
    </>
  );
}
