import { PageHeader } from "@/components/page-header";
import { Checklist } from "@/components/pages/checklist";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Mobile app",
  description:
    "The Grenada Meteorological Service mobile app — what it does and when it arrives.",
};

export default function AppGuidePage() {
  return (
    <>
      <PageHeader
        description="Weather and warnings for the tri-island state, on your phone."
        title="Mobile app"
      />
      <PlaceholderNotice product="The mobile app" />
      <PageSection heading="Planned features">
        <Checklist
          items={[
            "Push notification the moment a warning is issued for your parish.",
            "Current conditions and the daily forecast.",
            "Radar and satellite imagery.",
            "Marine forecast and small craft advisories.",
            "Preparedness checklists that work offline.",
          ]}
        />
      </PageSection>
      <PageSection heading="Offline first">
        <Prose
          paragraphs={[
            "An app that only works with a live connection is least useful exactly when it is needed most. Preparedness content and the last-received warning will remain readable with no network at all.",
            "Push notification for warnings is the feature that justifies an app over a website — it reaches people who are not looking.",
          ]}
        />
      </PageSection>
      <PageSection heading="Availability">
        <Prose
          paragraphs={[
            "The app follows the public website rather than preceding it. Until it is released, warnings are available on this site, through the WhatsApp channel, on radio and in the CAP feed.",
          ]}
        />
      </PageSection>
    </>
  );
}
