import { PageHeader } from "@/components/page-header";
import { LinkList } from "@/components/pages/link-list";
import { PageSection } from "@/components/pages/page-section";
import { PlaceholderNotice } from "@/components/pages/placeholder-notice";
import { Prose } from "@/components/pages/prose";
import { EVENT_FORECASTS } from "@/lib/events";

export const metadata = {
  title: "Event forecasts",
  description:
    "Venue-specific weather forecasts for Grenada's major outdoor events.",
};

export default function EventsPage() {
  return (
    <>
      <PageHeader
        description="Venue-specific forecasts for Grenada's outdoor calendar."
        title="Event forecasts"
      />
      <PlaceholderNotice product="The event forecasts on this page" />
      <PageSection heading="Events we forecast for">
        <LinkList
          links={EVENT_FORECASTS.map((event) => ({
            name: event.name,
            href: `/events/${event.slug}`,
            description: event.description,
            meta: `${event.period} · ${event.venue}`,
          }))}
        />
      </PageSection>
      <PageSection heading="What an event forecast is">
        <Prose
          paragraphs={[
            "A general forecast tells you the day will be showery. An event forecast tells you whether the wind will exceed the race committee's limit between two and five o'clock at the course, and what happens if it does.",
            "Each event forecast is built around the thresholds the organiser actually decides against — wind on a course, lightning near an open assembly point, rain during a road march — rather than around meteorological categories.",
          ]}
        />
      </PageSection>
      <PageSection heading="Requesting a forecast for your event">
        <Prose
          paragraphs={[
            "The Grenada Meteorological Service can provide forecasts for scheduled events, issued on an agreed schedule in the days before and updated on the day itself.",
            "Get in touch as early as possible with the venue, the timings, and the conditions that would cause you to change or cancel. Those thresholds are what the forecast is written against.",
          ]}
        />
      </PageSection>
    </>
  );
}
