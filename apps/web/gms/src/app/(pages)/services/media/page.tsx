import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "For media",
  description:
    "Broadcast-ready weather data, graphics and interview requests from the Grenada Meteorological Service.",
};

export default function MediaPage() {
  return (
    <>
      <PageHeader
        description="Broadcast-ready data, graphics and interviews."
        title="For media"
      />
      <PlaceholderNotice product="The media feeds on this page" />
      <PageSection heading="Present weather summary">
        <InfoTable
          headers={["Field", "Value"]}
          rows={[
            ["Issued", "16:00 AST"],
            ["Conditions", "Sunny intervals with isolated showers"],
            ["Temperature", "28 °C, feels like 32 °C"],
            ["Wind", "North-easterly 14 knots"],
            ["Outlook tonight", "Partly cloudy, isolated showers"],
            ["Warnings in effect", "None"],
          ]}
        />
      </PageSection>
      <PageSection heading="What we can supply">
        <InfoTable
          headers={["Item", "Format", "Notes"]}
          rows={[
            ["Present weather summary", "Text", "Written for reading on air"],
            ["Forecast graphics", "Image", "Broadcast-safe dimensions"],
            [
              "Warning bulletins",
              "Text and CAP",
              "Structured feed for automation",
            ],
            ["Forecaster interview", "Live or recorded", "By arrangement"],
            ["Event briefings", "Text", "Ahead of significant weather"],
          ]}
        />
      </PageSection>
      <PageSection heading="Using our material">
        <Prose
          paragraphs={[
            "Attribute forecasts and warnings to the Grenada Meteorological Service. During a developing event, always check the timestamp before broadcasting — a warning that has been superseded is worse than no warning.",
            "During high-impact events the service issues updates on a fixed cycle so newsrooms know when the next bulletin is due, rather than having to chase it.",
            "Interview requests go through the media desk. During an active event the duty forecaster stays on the warning, so interviews are arranged around the issue cycle.",
          ]}
        />
      </PageSection>
    </>
  );
}
