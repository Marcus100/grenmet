import { PageHeader } from "@/components/page-header";
import { PageSection } from "@/components/pages/page-section";
import { StatTiles } from "@/components/pages/stat-tiles";
import { UnavailableNotice } from "@/components/pages/unavailable-notice";
import { fetchCurrentConditions } from "@/lib/products";
import { stationReading } from "@/lib/weather-pages";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Current conditions",
  description:
    "The latest surface observation from Maurice Bishop International Airport.",
};

export default async function ConditionsPage() {
  const current = await fetchCurrentConditions();
  const reading = stationReading(current?.observation);
  return (
    <>
      <PageHeader
        description="The latest observation from Maurice Bishop International Airport (MBIA), the one station reporting here at present."
        title="Current conditions"
      />
      {reading ? (
        <PageSection heading={reading.stationName}>
          <p className="mb-4 text-body text-gm-text-secondary leading-body">
            {reading.observedAt}
            {reading.provisional && " · Provisional, not yet quality checked"}
          </p>
          <StatTiles stats={reading.tiles} />
        </PageSection>
      ) : (
        <UnavailableNotice
          product={
            current
              ? "No observation has been reported yet, so current conditions"
              : "Current conditions"
          }
        />
      )}
    </>
  );
}
