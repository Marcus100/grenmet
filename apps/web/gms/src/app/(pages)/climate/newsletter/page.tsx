import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";

export const metadata = {
  title: "Climate newsletter",
  description:
    "The Grenada Meteorological Service climate newsletter — what it covers and how to receive it.",
};

export default function NewsletterPage() {
  return (
    <>
      <PageHeader
        description="Climate conditions, outlooks and what they mean for Grenada."
        title="Climate newsletter"
      />
      <PlaceholderNotice product="The newsletter archive on this page" />
      <PageSection heading="What each issue covers">
        <Prose
          paragraphs={[
            "How the past month's rainfall and temperature compared with normal, station by station. The outlook for the coming months. Drought and water supply status across the tri-island state. A short piece on one aspect of Grenada's climate in more depth.",
            "The audience is people who make decisions on a seasonal horizon — growers, water managers, planners, and anyone whose business follows the wet and dry seasons.",
          ]}
        />
      </PageSection>
      <PageSection heading="Recent issues">
        <LinkList
          links={[
            {
              name: "Monthly climate summary",
              href: "/climate/monthly",
              description: "How last month compared with normal",
              meta: "Published monthly",
            },
            {
              name: "Seasonal outlook",
              href: "/climate/seasonal",
              description: "Rainfall and temperature for the months ahead",
              meta: "Published quarterly",
            },
            {
              name: "Drought monitoring",
              href: "/climate/drought",
              description: "Dry-spell status across the tri-island state",
              meta: "Updated during dry season",
            },
          ]}
        />
      </PageSection>
      <PageSection heading="Subscribing">
        <Prose
          paragraphs={[
            "An email subscription is being set up. Until then, each issue is published on this site and announced through the service's social channels.",
          ]}
        />
      </PageSection>
    </>
  );
}
