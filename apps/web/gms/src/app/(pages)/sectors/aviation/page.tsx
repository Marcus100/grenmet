import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Aviation weather",
  description:
    "Terminal forecasts, observations and briefings for pilots and airline operations in Grenada.",
};

export default function AviationPage() {
  return (
    <>
      <PageHeader
        description="Terminal forecasts and briefings for pilots and airlines."
        title="Aviation weather"
      />
      <PlaceholderNotice product="Aviation products on this page" />
      <PageSection heading="Aerodromes served">
        <InfoTable
          headers={["Aerodrome", "ICAO", "Products"]}
          rows={[
            [
              "Maurice Bishop International, Point Salines",
              "TGPY",
              "METAR, SPECI, TAF, aerodrome warnings",
            ],
            ["Lauriston, Carriacou", "TGPZ", "METAR, SPECI"],
          ]}
        />
      </PageSection>
      <PageSection heading="What each product is">
        <InfoTable
          headers={["Product", "What it covers", "Issued"]}
          rows={[
            ["METAR", "Routine observed conditions at the aerodrome", "Hourly"],
            [
              "SPECI",
              "Special observation when conditions change sharply",
              "As required",
            ],
            [
              "TAF",
              "Forecast conditions for the aerodrome and its vicinity",
              "Every 6 hours",
            ],
            [
              "Aerodrome warning",
              "Conditions that could damage aircraft or ground facilities",
              "As required",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="Briefings">
        <Prose
          paragraphs={[
            "The Grenada Meteorological Service provides pre-flight briefings to operators on request. Briefings cover terminal conditions, en-route weather and significant weather across the Eastern Caribbean.",
            "Aviation products follow ICAO Annex 3. Nothing on this public page substitutes for an official briefing or the current TAF and METAR obtained through operational channels.",
          ]}
        />
      </PageSection>
    </>
  );
}
