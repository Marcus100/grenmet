import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Stations",
  description:
    "Every station in the Grenada Meteorological Service observing network.",
};

export default function StationsPage() {
  return (
    <>
      <PageHeader
        description="Every station, what it measures and where it sits."
        title="Stations"
      />
      <PlaceholderNotice product="The station details on this page" />
      <PageSection heading="The network">
        <InfoTable
          headers={[
            "Station",
            "Parish / island",
            "Elevation",
            "Type",
            "Reporting",
          ]}
          rows={[
            [
              "Point Salines",
              "St. George",
              "Coastal",
              "Synoptic and aviation",
              "Hourly, continuous",
            ],
            ["St. George's", "St. George", "Coastal", "Automatic", "Hourly"],
            ["Pearls", "St. Andrew", "Coastal", "Automatic", "Hourly"],
            [
              "Grand Etang",
              "St. Andrew",
              "Highland interior",
              "Automatic",
              "Hourly",
            ],
            [
              "Lauriston",
              "Carriacou",
              "Coastal",
              "Automatic and aviation",
              "Hourly",
            ],
            [
              "Petite Martinique",
              "Petite Martinique",
              "Coastal",
              "Rainfall only",
              "Daily",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="What a station measures">
        <InfoTable
          headers={["Element", "Instrument", "Why it matters"]}
          rows={[
            [
              "Rainfall",
              "Tipping bucket rain gauge",
              "Flood and drought assessment; the core climate record",
            ],
            [
              "Temperature",
              "Shielded thermometer or probe",
              "Heat guidance, aviation, climate trend",
            ],
            [
              "Wind",
              "Anemometer and vane",
              "Marine and aviation forecasts, warning thresholds",
            ],
            [
              "Pressure",
              "Barometer",
              "Tracking systems and confirming model analysis",
            ],
            [
              "Humidity",
              "Hygrometer",
              "Shower potential, heat stress, aviation",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Siting matters as much as the instrument">
        <Prose
          paragraphs={[
            "A station's readings are only comparable with others if it is sited to World Meteorological Organization standards — clear of buildings and trees, at standard instrument height, with proper shielding from direct sun.",
            "A well-sited cheap sensor beats a badly-sited expensive one. Most bad weather data is a siting problem, not an instrument problem.",
          ]}
        />
      </PageSection>
    </>
  );
}
