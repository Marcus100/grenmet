import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Regional weather",
  description:
    "Neighbouring meteorological services and the regional centres Grenada works with.",
};

export default function RegionalPage() {
  return (
    <>
      <PageHeader
        description="Neighbouring services and the regional centres we work with."
        title="Regional weather"
      />
      <PageSection heading="Eastern Caribbean services">
        <InfoTable
          headers={["Country", "National service"]}
          rows={[
            ["Barbados", "Barbados Meteorological Services"],
            [
              "Trinidad and Tobago",
              "Trinidad and Tobago Meteorological Service",
            ],
            ["St. Vincent and the Grenadines", "SVG Meteorological Services"],
            ["St. Lucia", "St. Lucia Meteorological Services"],
            ["Dominica", "Dominica Meteorological Service"],
            [
              "Antigua and Barbuda",
              "Antigua and Barbuda Meteorological Service",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Regional and global centres">
        <InfoTable
          headers={["Centre", "Provides"]}
          rows={[
            [
              "National Hurricane Centre, Miami",
              "Tropical cyclone track, intensity and advisories",
            ],
            [
              "Caribbean Institute for Meteorology and Hydrology",
              "Regional climate outlooks and training",
            ],
            [
              "Caribbean Meteorological Organization",
              "Regional coordination among national services",
            ],
            [
              "Pacific Tsunami Warning Center",
              "Tsunami messages for the Caribbean",
            ],
            ["Washington VAAC", "Volcanic ash advisories for the region"],
          ]}
        />
      </PageSection>
      <PageSection heading="Why a small service depends on its neighbours">
        <Prose
          paragraphs={[
            "Weather arrives in Grenada from the east, having crossed thousands of kilometres of open ocean where there are no observations. What the island knows about tomorrow depends heavily on satellite imagery, model guidance and upper-air soundings shared across the region.",
            "The exchange runs both ways. Grenada's observations are one of the few surface reports in the southern Windward Islands, and they matter to every forecast office downstream.",
            "This is why standards work is not bureaucracy. A regional network only functions if everyone measures and codes the same way.",
          ]}
        />
      </PageSection>
    </>
  );
}
