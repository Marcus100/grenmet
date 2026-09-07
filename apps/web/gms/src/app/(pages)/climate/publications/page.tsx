import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Publications",
  description:
    "Reports, bulletins and climate studies from the Grenada Meteorological Service.",
};

export default function PublicationsPage() {
  return (
    <>
      <PageHeader
        description="Reports, bulletins and climate studies."
        title="Publications"
      />
      <PlaceholderNotice product="The publication list on this page" />
      <PageSection heading="Regular publications">
        <LinkList
          links={[
            {
              name: "Monthly climate summary",
              href: "/climate/monthly",
              description: "How the month compared with normal, by station",
              meta: "Monthly",
            },
            {
              name: "Seasonal outlook",
              href: "/climate/seasonal",
              description:
                "Rainfall and temperature guidance for the coming months",
              meta: "Quarterly",
            },
            {
              name: "Drought bulletin",
              href: "/climate/drought",
              description: "Dry-spell status across the tri-island state",
              meta: "Monthly during dry season",
            },
            {
              name: "Hurricane season outlook",
              href: "/resources/hurricane",
              description:
                "Pre-season briefing on the outlook and what to prepare",
              meta: "Annual, before 1 June",
            },
          ]}
        />
      </PageSection>
      <PageSection heading="Archive">
        <Prose
          paragraphs={[
            "Past editions of each publication will be listed here as the digital archive is populated. Earlier material is available on request through general enquiries.",
          ]}
        />
      </PageSection>
    </>
  );
}
