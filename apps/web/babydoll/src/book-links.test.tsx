import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ContactPage from "@/app/contact/page";
import NotFound from "@/app/not-found";
import HomePage from "@/app/page";
import ServicesPage from "@/app/services/page";
import { BookBar } from "@/components/book-bar";
import { SiteHeader } from "@/components/site-header";
import { BOOKING_URL } from "@/data/site";
import { ON_SITE_BOOKING_HREF, siteBookingLink } from "@/lib/book-link";

const mocks = vi.hoisted(() => ({
  env: { BABYDOLL_ONLINE_BOOKING: "off" as "on" | "off" },
}));

vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

// Renders each Book call-to-action surface the way the layout and pages do:
// the server side reads the switch once and hands the link down.
const SURFACES = {
  "site header": () => <SiteHeader booking={siteBookingLink()} />,
  "book bar": () => <BookBar booking={siteBookingLink()} />,
  home: () => <HomePage />,
  services: () => <ServicesPage />,
  contact: () => <ContactPage />,
  "not found": () => <NotFound />,
} as const;

function bookingAnchors(container: HTMLElement) {
  const anchors = Array.from(container.querySelectorAll("a[href]"));
  const onSite = anchors.filter(
    (a) => a.getAttribute("href") === ON_SITE_BOOKING_HREF
  );
  const acuity = anchors.filter((a) =>
    (a.getAttribute("href") ?? "").startsWith(BOOKING_URL)
  );
  return { onSite, acuity };
}

describe.each(["on", "off"] as const)(
  "Book links with BABYDOLL_ONLINE_BOOKING=%s",
  (state) => {
    beforeEach(() => {
      mocks.env.BABYDOLL_ONLINE_BOOKING = state;
    });

    it.each(Object.entries(SURFACES))(
      "%s links only to the active booking flow",
      (_, Surface) => {
        const { container } = render(<Surface />);
        const { onSite, acuity } = bookingAnchors(container);

        if (state === "on") {
          expect(acuity).toHaveLength(0);
          expect(onSite.length).toBeGreaterThan(0);
          for (const anchor of onSite) {
            expect(anchor).not.toHaveAttribute("target");
          }
        } else {
          expect(onSite).toHaveLength(0);
          expect(acuity.length).toBeGreaterThan(0);
          for (const anchor of acuity) {
            expect(anchor).toHaveAttribute("target", "_blank");
            expect(anchor).toHaveAttribute("rel", "noopener");
          }
        }
      }
    );
  }
);

describe("Book links on the services page", () => {
  it("sends each bookable service to /book when the switch is on", () => {
    mocks.env.BABYDOLL_ONLINE_BOOKING = "on";
    const { container } = render(<ServicesPage />);
    const booking = container.querySelector('a[aria-label="Book Volume"]');
    expect(booking).toHaveAttribute("href", ON_SITE_BOOKING_HREF);
  });

  it("keeps each service on Acuity when the switch is off", () => {
    mocks.env.BABYDOLL_ONLINE_BOOKING = "off";
    const { container } = render(<ServicesPage />);
    const booking = container.querySelector('a[aria-label="Book Volume"]');
    expect(booking).toHaveAttribute("href", BOOKING_URL);
  });
});
