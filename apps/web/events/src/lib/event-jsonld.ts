import { absoluteUrl } from "@barrelsgd/ui/lib/seo";
import { PARISH_LABELS } from "@/domain/labels";
import type { EventDetail } from "@/domain/types";

/**
 * schema.org Event for a public event page. Only published fields are used:
 * the title, summary, times, venue, parish, organiser name and the public
 * ticket price. Viewer-specific fields (held tickets, RSVP state) never appear.
 */
export function eventJsonLd(
  siteUrl: string,
  event: Pick<
    EventDetail,
    | "admission"
    | "endsAt"
    | "organiser"
    | "parish"
    | "priceFrom"
    | "slug"
    | "startsAt"
    | "summary"
    | "title"
    | "venue"
  >
): Record<string, unknown> {
  const url = absoluteUrl(siteUrl, `/events/${event.slug}`);
  const offers = offersFor(event.admission, event.priceFrom, url);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.summary,
    startDate: event.startsAt,
    endDate: event.endsAt,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url,
    location: {
      "@type": "Place",
      name: event.venue,
      address: {
        "@type": "PostalAddress",
        addressLocality: PARISH_LABELS[event.parish],
        addressCountry: "GD",
      },
    },
    organizer: {
      "@type": "Organization",
      name: event.organiser.name,
    },
    ...(offers ? { offers } : {}),
  };
}

function offersFor(
  admission: EventDetail["admission"],
  priceFrom: EventDetail["priceFrom"],
  url: string
): Record<string, unknown> | undefined {
  if (admission === "ticketed") {
    if (!priceFrom) {
      return undefined;
    }
    return {
      "@type": "Offer",
      url,
      price: (priceFrom.amountMinor / 100).toFixed(2),
      priceCurrency: priceFrom.currency,
      availability: "https://schema.org/InStock",
    };
  }
  return {
    "@type": "Offer",
    url,
    price: "0",
    priceCurrency: priceFrom?.currency ?? "XCD",
    availability: "https://schema.org/InStock",
  };
}
