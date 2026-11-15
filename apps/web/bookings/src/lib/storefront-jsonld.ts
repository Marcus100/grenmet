import type { BookingStorefront } from "@barrelsgd/api-client";
import { absoluteUrl } from "@barrelsgd/ui/lib/seo";

/**
 * schema.org LocalBusiness for a business's public booking page. It carries
 * only what the business published: its name, the contact details it chose to
 * show, and its public services with their prices. Nothing about a visitor.
 */
export function storefrontJsonLd(
  siteUrl: string,
  storefront: Pick<
    BookingStorefront,
    "contact" | "currency" | "display_name" | "services" | "slug"
  >
): Record<string, unknown> {
  const { contact } = storefront;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: storefront.display_name,
    url: absoluteUrl(siteUrl, `/${storefront.slug}`),
    ...(contact.phone ? { telephone: contact.phone } : {}),
    ...(contact.email ? { email: contact.email } : {}),
    ...(storefront.services.length > 0
      ? {
          makesOffer: storefront.services.map((service) => ({
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: service.name,
              ...(service.description
                ? { description: service.description }
                : {}),
            },
            price: (service.price_minor / 100).toFixed(2),
            priceCurrency: storefront.currency,
          })),
        }
      : {}),
  };
}
