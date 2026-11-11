import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { Provenance } from "@/components/pages/provenance";
import { UnavailableNotice } from "@/components/pages/unavailable-notice";
import { weatherFromForecast } from "@/lib/forecast-selection";
import { fetchPublicForecast } from "@/lib/products";
import { forecastRows, hasIssuedForecast } from "@/lib/weather-pages";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Next 5 days",
  description:
    "Tonight and the next four days for Grenada, Carriacou and Petite Martinique.",
};

export default async function FiveDayPage() {
  const forecast = await fetchPublicForecast();
  const days = forecast ? weatherFromForecast(forecast).days : [];
  const live = hasIssuedForecast(days);
  const issuedAt = forecast?.periods[0]?.source?.issued_at;
  return (
    <>
      <PageHeader
        description="Tonight and the next four days at a glance."
        title="Next 5 days"
      />
      {forecast ? null : <UnavailableNotice product="The 5-day forecast" />}
      {forecast && !live && (
        <p
          className="rounded-gm-card border-gm-border text-body-base leading-body-base border p-4"
          role="status"
        >
          No forecast has been published for the next five days yet. Check back
          after the next issue.
        </p>
      )}
      {live && (
        <PageSection heading="Grenada, Carriacou and Petite Martinique">
          {issuedAt && (
            <Provenance
              kind="forecast"
              source="GMS forecast"
              status="verified"
              time={issuedAt}
              validTo={days[0]?.validTo ?? undefined}
            />
          )}
          <InfoTable
            caption="From the latest issued GMS forecasts"
            headers={["Day", "Outlook", "High", "Low", "Wind", "Rain chance"]}
            rows={forecastRows(days)}
          />
        </PageSection>
      )}
      <PageSection heading="Issue schedule">
        <Prose
          paragraphs={[
            "Forecasts are issued three times a day, at 07:00, 12:00 and 18:00 Grenada time (AST), and amended whenever conditions change materially. The evening forecast covers tonight and the next four days.",
          ]}
        />
      </PageSection>
    </>
  );
}
