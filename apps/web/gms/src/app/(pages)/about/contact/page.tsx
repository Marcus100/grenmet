import { PageHeader } from "@/components/page-header";
import { InfoTable } from "@/components/pages/info-table";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

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
      <PlaceholderNotice product="The contact details on this page" />
      <PageSection heading="Head office">
        <InfoTable
          headers={["Detail", "Value"]}
          rows={[
            [
              "Address",
              "Grenada Meteorological Service, Maurice Bishop International Airport, Point Salines, St. George's, Grenada",
            ],
            ["Office hours", "Monday to Friday, 08:00 – 16:00 AST"],
            ["Telephone", "To be confirmed"],
            ["General enquiries", "To be confirmed"],
          ]}
        />
      </PageSection>
      <PageSection heading="Who to contact">
        <InfoTable
          headers={["Enquiry", "Route", "Response"]}
          rows={[
            [
              "General public enquiry",
              "General enquiries",
              "Within 3 working days",
            ],
            [
              "Media and interview requests",
              "Media desk",
              "Same working day where possible",
            ],
            [
              "Aviation briefing",
              "Operational channels — not this website",
              "Immediate",
            ],
            ["Marine enquiry", "General enquiries", "Within 3 working days"],
            [
              "Climate data request",
              "Data request form",
              "Within 10 working days",
            ],
            [
              "Website fault or correction",
              "General enquiries",
              "Within 3 working days",
            ],
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
