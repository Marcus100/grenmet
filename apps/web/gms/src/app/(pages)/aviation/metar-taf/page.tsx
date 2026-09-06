import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "METAR and TAF",
  description:
    "Current aerodrome observations and terminal forecasts for Grenada.",
};

export default function MetarTafPage() {
  return (
    <>
      <PageHeader
        description="Current observations and terminal forecasts."
        title="METAR and TAF"
      />
      <PlaceholderNotice product="The bulletins on this page" />
      <PageSection heading="Latest bulletins">
        <InfoTable
          headers={["Aerodrome", "Type", "Bulletin"]}
          rows={[
            [
              "TGPY",
              "METAR",
              "TGPY 061600Z 06012KT 9999 FEW018 SCT100 28/23 Q1013 NOSIG",
            ],
            [
              "TGPY",
              "TAF",
              "TGPY 061400Z 0615/0715 06012KT 9999 SCT018 TEMPO 0618/0622 4000 SHRA BKN014",
            ],
            ["TGPZ", "METAR", "TGPZ 061600Z 05014KT 9999 FEW020 29/24 Q1013"],
          ]}
        />
      </PageSection>
      <PageSection heading="Reading a METAR">
        <InfoTable
          headers={["Group", "Example", "Meaning"]}
          rows={[
            ["Station", "TGPY", "Maurice Bishop International"],
            ["Time", "061600Z", "6th of the month, 16:00 UTC"],
            ["Wind", "06012KT", "From 060°, 12 knots"],
            ["Visibility", "9999", "10 km or more"],
            [
              "Cloud",
              "FEW018 SCT100",
              "Few at 1800 ft, scattered at 10 000 ft",
            ],
            ["Temperature", "28/23", "28 °C, dew point 23 °C"],
            ["Pressure", "Q1013", "QNH 1013 hPa"],
            ["Trend", "NOSIG", "No significant change expected"],
          ]}
        />
      </PageSection>
      <PageSection heading="Issue schedule">
        <Prose
          paragraphs={[
            "METAR is issued hourly. SPECI is issued whenever conditions change beyond defined thresholds between routine observations — a wind shift, a visibility drop, the onset of thunderstorms.",
            "TAF for TGPY is issued every six hours and covers the period stated in the bulletin, with amendments whenever the forecast no longer reflects expected conditions.",
          ]}
        />
      </PageSection>
    </>
  );
}
