import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Tourism and events weather",
  description:
    "Planning weather for visitors, outdoor events, cruise calls and the festival calendar.",
};

export default function TourismPage() {
  return (
    <>
      <PageHeader
        description="Planning weather for visitors and outdoor events."
        title="Tourism and events weather"
      />
      <PlaceholderNotice product="Event forecasts on this page" />
      <PageSection heading="Event forecasting">
        <Prose
          paragraphs={[
            "An event organiser needs something a general forecast cannot give: hour-by-hour conditions at one location, against the thresholds that actually stop the event. A rain chance is not a decision. “Wind above 25 knots at the stage between 16:00 and 19:00” is.",
            "The Grenada Meteorological Service can provide venue-specific forecasts for scheduled events, issued on an agreed schedule in the days before and updated on the day.",
          ]}
        />
      </PageSection>
      <PageSection heading="Grenada's outdoor calendar">
        <InfoTable
          headers={["Event", "Period", "Weather sensitivity"]}
          rows={[
            [
              "Grenada Sailing Week",
              "Late January",
              "Wind speed and direction, sea state",
            ],
            [
              "Carriacou Maroon and String Band Festival",
              "April",
              "Rainfall, heat",
            ],
            ["Grenada Chocolate Fest", "May", "Rainfall for outdoor sessions"],
            [
              "Carriacou Regatta Festival",
              "Late July / early August",
              "Wind, sea state in the passage",
            ],
            ["Spicemas", "August", "Rainfall, heat during road events"],
            [
              "Cruise season",
              "November – April",
              "Sea state for tender operations, rainfall for shore excursions",
            ],
          ]}
        />
      </PageSection>
      <PageSection heading="For visitors">
        <Prose
          paragraphs={[
            "Grenada's dry season runs January to May and the wet season June to December. Even in the wet season, rainfall is usually short and heavy rather than all-day — a shower passes and the day returns.",
            "The Atlantic hurricane season runs 1 June to 30 November. Grenada sits at the southern edge of the hurricane belt, but direct impacts do occur and visitors during those months should know where their accommodation's shelter guidance is.",
          ]}
        />
      </PageSection>
    </>
  );
}
