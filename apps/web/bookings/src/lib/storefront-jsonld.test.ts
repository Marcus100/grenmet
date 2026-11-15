import { describe, expect, it } from "vitest";
import { storefrontJsonLd } from "./storefront-jsonld";

const SITE = "https://bookings.barrels.gd";
const PRIVATE_FIELDS = /whatsapp|instagram|token|session/u;

const storefront = {
  slug: "spice-salon",
  display_name: "Spice Salon",
  currency: "XCD",
  contact: {
    phone: "+14734001234",
    email: "hello@spice.example",
    whatsapp: "+14734005678",
    instagram: "spicesalon",
  },
  services: [
    {
      id: "s1",
      name: "Cut and style",
      description: "A wash and cut.",
      price_minor: 12_000,
    },
  ],
} as unknown as Parameters<typeof storefrontJsonLd>[1];

describe("storefrontJsonLd", () => {
  it("names the business, its URL and its published services with prices", () => {
    expect(storefrontJsonLd(SITE, storefront)).toMatchObject({
      "@type": "LocalBusiness",
      name: "Spice Salon",
      url: "https://bookings.barrels.gd/spice-salon",
      telephone: "+14734001234",
      email: "hello@spice.example",
      makesOffer: [
        {
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: "Cut and style" },
          price: "120.00",
          priceCurrency: "XCD",
        },
      ],
    });
  });

  it("leaves out contact fields the business has not set", () => {
    const data = storefrontJsonLd(SITE, {
      ...storefront,
      contact: { phone: null, email: null, whatsapp: null, instagram: null },
    });
    expect(data).not.toHaveProperty("telephone");
    expect(data).not.toHaveProperty("email");
  });

  it("never includes whatsapp, instagram or visitor data", () => {
    const text = JSON.stringify(storefrontJsonLd(SITE, storefront));
    expect(JSON.parse(text)).toBeTruthy();
    expect(text).not.toMatch(PRIVATE_FIELDS);
  });
});
