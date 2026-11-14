import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ContactPage from "@/app/contact/page";
import NotFound from "@/app/not-found";
import HomePage from "@/app/page";
import ServicesPage from "@/app/services/page";
import { BookBar } from "@/components/book-bar";
import { SiteHeader } from "@/components/site-header";
import { siteBookingLink } from "@/lib/book-link";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

// Renders each Book call-to-action surface the way the layout and pages do.
const SURFACES = {
  "site header": () => <SiteHeader booking={siteBookingLink()} />,
  "book bar": () => <BookBar booking={siteBookingLink()} />,
  home: () => <HomePage />,
  services: () => <ServicesPage />,
  contact: () => <ContactPage />,
  "not found": () => <NotFound />,
} as const;

const BOOKING_HREF = siteBookingLink().href;

describe("Book links", () => {
  it.each(Object.entries(SURFACES))(
    "%s opens the booking page in a new tab and never a page on this site",
    (_, Surface) => {
      const { container } = render(<Surface />);
      const anchors = Array.from(container.querySelectorAll("a[href]"));
      const booking = anchors.filter((a) =>
        (a.getAttribute("href") ?? "").startsWith(BOOKING_HREF)
      );
      expect(booking.length).toBeGreaterThan(0);
      for (const anchor of booking) {
        expect(anchor).toHaveAttribute("target", "_blank");
        expect(anchor).toHaveAttribute("rel", "noopener");
      }
      // The removed on-site flow lived at /book and /booking/<token>.
      const onSite = anchors.filter((a) =>
        (a.getAttribute("href") ?? "").startsWith("/book")
      );
      expect(onSite).toHaveLength(0);
    }
  );

  it("sends each bookable service to the booking page", () => {
    const { container } = render(<ServicesPage />);
    const booking = container.querySelector('a[aria-label="Book Volume"]');
    expect(booking).toHaveAttribute("href", BOOKING_HREF);
  });
});
