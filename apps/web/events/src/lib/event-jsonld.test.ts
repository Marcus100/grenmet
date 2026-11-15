import { describe, expect, it } from "vitest";
import type { EventDetail } from "@/domain/types";
import { eventJsonLd } from "./event-jsonld";

const SITE = "https://events.barrels.gd";
const VIEWER_FIELDS = /held|goingNames|token|email/u;

function fixture(overrides: Partial<EventDetail> = {}) {
  return {
    admission: "ticketed",
    endsAt: "2026-12-27T02:00:00.000Z",
    organiser: { name: "Spice Festival Committee" },
    parish: "st-george",
    priceFrom: { amountMinor: 5000, currency: "XCD" },
    slug: "spicemas-parade",
    startsAt: "2026-12-26T20:00:00.000Z",
    summary: "The parade through town.",
    title: "Spicemas Parade",
    venue: "Carenage",
    ...overrides,
  } as Pick<
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
  >;
}

describe("eventJsonLd", () => {
  it("describes a ticketed event with its public price and canonical URL", () => {
    const data = eventJsonLd(SITE, fixture());
    expect(data).toMatchObject({
      "@type": "Event",
      name: "Spicemas Parade",
      startDate: "2026-12-26T20:00:00.000Z",
      url: "https://events.barrels.gd/events/spicemas-parade",
      location: { "@type": "Place", name: "Carenage" },
      organizer: { name: "Spice Festival Committee" },
      offers: { price: "50.00", priceCurrency: "XCD" },
    });
  });

  it("gives free events a zero offer", () => {
    const data = eventJsonLd(
      SITE,
      fixture({ admission: "free", priceFrom: null })
    );
    expect(data.offers).toMatchObject({ price: "0", priceCurrency: "XCD" });
  });

  it("omits offers for a ticketed event with no public price", () => {
    const data = eventJsonLd(SITE, fixture({ priceFrom: null }));
    expect(data).not.toHaveProperty("offers");
  });

  it("serialises to JSON with no viewer-only fields", () => {
    const text = JSON.stringify(eventJsonLd(SITE, fixture()));
    expect(JSON.parse(text)).toBeTruthy();
    expect(text).not.toMatch(VIEWER_FIELDS);
  });
});
