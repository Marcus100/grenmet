import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { SatelliteImages } from "@/components/pages/satellite-images";
import { fetchSatelliteLatest } from "@/lib/satellite";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Satellite",
  description: "Cloud and storm systems across the Eastern Caribbean.",
};

export default async function SatellitePage() {
  const result = await fetchSatelliteLatest();
  return (
    <>
      <PageHeader
        description="Cloud and storms across the region."
        title="Satellite"
      />
      <PageSection>
        <SatelliteImages images={result.images} status={result.status} />
      </PageSection>
      <PageSection heading="Reading the two channels">
        <Prose
          paragraphs={[
            "The visible channel shows sunlight reflected from cloud tops, so it is only useful in daylight. Thick cloud appears bright, thin cloud appears grey.",
            "The infrared channel measures temperature and works around the clock. The coldest tops appear brightest, which is how the tallest and most active storm cells are identified overnight.",
            "Satellite imagery for the Eastern Caribbean comes from the GOES series operated by NOAA/NESDIS. It is not a GMS product.",
          ]}
        />
      </PageSection>
    </>
  );
}
