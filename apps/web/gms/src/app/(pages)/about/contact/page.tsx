import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { Prose } from "@/components/pages/prose";
import { GMS_CONTACTS } from "@/lib/contacts";

export const metadata = {
  title: "Contact us",
  description:
    "How to reach the Grenada Meteorological Service — general enquiries, media, aviation, marine and data requests.",
};

export default function ContactPage() {
  return (
    <>
      <PageHeader
        description="How to reach the Grenada Meteorological Service."
        title="Contact us"
      />
      <PageSection heading="Head office">
        <InfoTable
          headers={["Detail", "Value"]}
          rows={[
            [
              "Address",
              "Grenada Meteorological Service, Maurice Bishop International Airport, Point Salines, St. George's, Grenada",
            ],
            ["Telephone (main line)", GMS_CONTACTS.mainLine.label],
            ["Forecast office", GMS_CONTACTS.forecastOffice.label],
            ["WhatsApp", GMS_CONTACTS.whatsApp.label],
            ["General enquiries", GMS_CONTACTS.email],
          ]}
        />
      </PageSection>
      <PageSection heading="During an emergency">
        <Prose
          paragraphs={[
            "In an emergency, contact the emergency services or the National Disaster Management Agency. The Grenada Meteorological Service issues warnings; it does not coordinate the emergency response and cannot dispatch assistance.",
            "The forecast office is staffed continuously during high-impact events. Routine enquiries are answered after the event so that the duty forecaster stays on the warning.",
          ]}
        />
      </PageSection>
      <PageSection heading="Reporting weather">
        <Prose
          paragraphs={[
            "Reports from the public are genuinely useful — flooding at a known crossing, hail, a waterspout, wind damage, or a landslip. Include the time, the location and what you observed, and a photograph where it is safe to take one.",
            "Never put yourself at risk to make a report.",
          ]}
        />
      </PageSection>
    </>
  );
}
