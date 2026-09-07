import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Downloads",
  description:
    "Forms, posters and guides from the Grenada Meteorological Service.",
};

export default function DownloadsPage() {
  return (
    <>
      <PageHeader
        description="Forms, posters and guides to keep."
        title="Downloads"
      />
      <PlaceholderNotice product="The downloadable files on this page" />
      <PageSection heading="Preparedness">
        <LinkList
          links={[
            {
              name: "Hurricane preparedness checklist",
              href: "/resources/hurricane",
              description: "Household kit and action list for the season",
              meta: "Read online — printable version to follow",
            },
            {
              name: "Flood preparedness guide",
              href: "/resources/flood",
              description: "Before, during and after heavy rain",
              meta: "Read online — printable version to follow",
            },
            {
              name: "Warning levels poster",
              href: "/warnings/levels",
              description: "The advisory, watch and warning scale",
              meta: "Read online — printable version to follow",
            },
          ]}
        />
      </PageSection>
      <PageSection heading="Reference">
        <LinkList
          links={[
            {
              name: "Weather glossary",
              href: "/resources/glossary",
              description: "Terms used in forecasts and warnings",
              meta: "Read online",
            },
            {
              name: "Climate data request",
              href: "/climate/data-request",
              description: "What to include when requesting data",
              meta: "Read online — form to follow",
            },
          ]}
        />
      </PageSection>
      <PageSection heading="About these files">
        <Prose
          paragraphs={[
            "Printable versions of each guide are being prepared. Until they are published, the online pages carry the same content and can be printed directly from the browser.",
          ]}
        />
      </PageSection>
    </>
  );
}
