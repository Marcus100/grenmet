import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { Provenance } from "@/components/pages/provenance";
import { UnavailableNotice } from "@/components/pages/unavailable-notice";
import { weatherFromForecast } from "@/lib/forecast-selection";
import { fetchPublicForecast } from "@/lib/products";
import { hasIssuedForecast, threeDayRows } from "@/lib/weather-pages";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "3-day forecast",
  description:
    "The next three days for Grenada, Carriacou and Petite Martinique.",
};

export default async function ThreeDayPage() {
  const forecast = await fetchPublicForecast();
  const days = forecast ? weatherFromForecast(forecast).days : [];
  const live = hasIssuedForecast(days);
  const issuedAt = forecast?.periods[0]?.source?.issued_at;
  return (
    <>
      <PageHeader
        description="The next three days at a glance."
        title="3-day forecast"
      />
      {forecast ? null : <UnavailableNotice product="The 3-day forecast" />}
      {forecast && !live && (
        <p
          className="rounded-gm-card border-gm-border text-body-base leading-body-base border p-4"
          role="status"
        >
          No forecast has been published for the next three days yet. Check back
          after the next issue.
        </p>
      )}
      {live && (
        <PageSection heading="Grenada, Carriacou and Petite Martinique">
          {issuedAt && (
            <Provenance
              kind="forecast"
              source="GMS impact-based forecast"
              status="verified"
              time={issuedAt}
            />
          )}
          <InfoTable
            caption="From the latest issued GMS forecasts"
            headers={["Day", "Outlook", "High", "Low", "Wind", "Rain chance"]}
            rows={threeDayRows(days)}
          />
        </PageSection>
      )}
      <PageSection heading="Issue schedule">
        <Prose
          paragraphs={[
            "The 3-day forecast is issued twice daily at 06:00 and 18:00 AST, and amended whenever conditions change materially.",
          ]}
        />
      </PageSection>
    </>
  );
}
