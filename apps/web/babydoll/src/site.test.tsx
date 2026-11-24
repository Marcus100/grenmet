import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AboutPage from "@/app/about/page";
import ContactPage from "@/app/contact/page";
import HomePage from "@/app/page";
import PortfolioPage from "@/app/portfolio/page";
import ServicesPage from "@/app/services/page";
import TrainingPage from "@/app/training/page";
import { BookBar } from "@/components/book-bar";
import { SiteHeader } from "@/components/site-header";
import {
  BOOKING_URL,
  CONSULTATION_PRICE,
  CONTACT_CHANNELS,
  EMAIL,
  formatPrice,
  GOOGLE_REVIEW_URL,
  INSTAGRAM_DM_URL,
  INSTAGRAM_HANDLE,
  PACKAGES,
  PHONE,
  PORTFOLIO,
  SERVICE_MENU,
  WHATSAPP_URL,
} from "@/data/site";
import { bookingLink, siteBookingLink } from "@/lib/book-link";

const APPOINTMENT = /appointment/iu;
const BOOK_ONLINE = /Book online/u;
const QUICKEST = /quickest/iu;
const APPOINTMENT_NOTE =
  "Book online and choose a time that suits you. Walk-ins can't be seen.";
// Clock times, day names and the words that used to head the hours table.
const HOURS_TEXT =
  /\d{1,2}(:\d{2})? ?[ap]m|\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Opening|hours|Closed)\b/iu;
// A dollar sign not preceded by "EC".
const BARE_DOLLAR = /(?<!EC)\$/u;
const OLD_LISTING = /True Blue|Fresha/u;

vi.mock("next/navigation", () => ({ usePathname: () => "/services" }));

const PAGES = [
  ["home", HomePage],
  ["services", ServicesPage],
  ["portfolio", PortfolioPage],
  ["about", AboutPage],
  ["training", TrainingPage],
  ["contact", ContactPage],
] as const;

describe("pages", () => {
  it.each(PAGES)("%s page has exactly one h1", (_, Page) => {
    render(<Page />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("home links to booking, the Google review form and the new address", () => {
    render(<HomePage />);
    const booking = screen.getAllByRole("link", { name: APPOINTMENT });
    expect(booking[0]).toHaveAttribute("href", siteBookingLink().href);
    expect(
      screen.getByRole("link", { name: "Leave a Google review" })
    ).toHaveAttribute("href", GOOGLE_REVIEW_URL);
    expect(screen.getByText("Lower Mont Tout")).toBeInTheDocument();
    expect(screen.queryByText(OLD_LISTING)).not.toBeInTheDocument();
    expect(screen.getByText("By appointment only")).toBeInTheDocument();
  });

  it("contact explains appointments and lists no opening hours", () => {
    render(<ContactPage />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Appointments" })
    ).toBeInTheDocument();
    expect(screen.getByText(APPOINTMENT_NOTE)).toBeInTheDocument();
    expect(screen.getByText("By appointment only")).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: BOOK_ONLINE }))
      expect(link).toHaveAttribute("href", siteBookingLink().href);
  });

  it("contact links WhatsApp, phone and email with exact hrefs", () => {
    render(<ContactPage />);
    expect(
      screen.getByRole("link", {
        name: "Message on WhatsApp +1 473 420 7747 (opens in a new tab)",
      })
    ).toHaveAttribute("href", "https://wa.me/14734207747");
    expect(
      screen.getByRole("link", { name: "Call +1 473 420 7747" })
    ).toHaveAttribute("href", "tel:+14734207747");
    expect(
      screen.getByRole("link", { name: "Email us hello@babydollbeautybar.com" })
    ).toHaveAttribute("href", "mailto:hello@babydollbeautybar.com");
    expect(
      screen.getByRole("link", {
        name: "Message on Instagram @babydoll.gnd (opens in a new tab)",
      })
    ).toHaveAttribute("href", "https://ig.me/m/babydoll.gnd");
  });

  it("contact lists WhatsApp, Call, Instagram, then email, and no 'quickest' claim", () => {
    const { container } = render(<ContactPage />);
    const titles = [...container.querySelectorAll(".channel > b")].map(
      (node) => node.textContent
    );
    expect(titles.slice(0, 5)).toEqual([
      "Book online",
      "Message on WhatsApp",
      "Call",
      "Message on Instagram",
      "Email us",
    ]);
    expect(container.textContent).not.toMatch(QUICKEST);
  });

  it.each(PAGES)("%s page shows no opening hours", (_, Page) => {
    const { container } = render(<Page />);
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).not.toMatch(HOURS_TEXT);
  });
});

describe("service menu", () => {
  it("renders every service price, with all panels in the HTML", () => {
    render(<ServicesPage />);
    const services = SERVICE_MENU.flatMap((category) =>
      category.groups.flatMap((group) => group.services)
    );
    for (const service of services)
      expect(
        screen.getByRole("heading", {
          level: 3,
          name: service.name,
          hidden: true,
        })
      ).toBeInTheDocument();
  });

  it("books every service except add-ons", () => {
    render(<ServicesPage />);
    expect(screen.getByRole("link", { name: "Book Volume" })).toHaveAttribute(
      "href",
      siteBookingLink().href
    );
    expect(
      screen.queryByRole("link", {
        name: "Book Deluxe brow add-on",
        hidden: true,
      })
    ).not.toBeInTheDocument();
  });

  it("switches category with the tabs", async () => {
    render(<ServicesPage />);
    expect(screen.getByRole("tabpanel", { name: "Lashes" })).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "Brows" }));
    expect(screen.getByRole("tab", { name: "Brows" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tabpanel", { name: "Brows" })).toBeVisible();
  });
});

describe("portfolio", () => {
  it("filters photo slots by category", async () => {
    render(<PortfolioPage />);
    expect(screen.getAllByRole("listitem")).toHaveLength(PORTFOLIO.length);
    await userEvent.click(screen.getByRole("button", { name: "Brows" }));
    const brows = PORTFOLIO.filter((shot) => shot.category === "brows");
    expect(screen.getAllByRole("listitem")).toHaveLength(brows.length);
  });
});

describe("chrome", () => {
  it("marks the current page and toggles the mobile menu", async () => {
    render(<SiteHeader booking={bookingLink(null)} />);
    expect(screen.getByRole("link", { name: "Services" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    const toggle = screen.getByRole("button", { name: "Open menu" });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("the phone book bar links to booking", () => {
    render(<BookBar booking={bookingLink(null)} />);
    expect(
      screen.getByRole("link", { name: "Book me (opens in a new tab)" })
    ).toHaveAttribute("href", BOOKING_URL);
  });
});

describe("training contact channels", () => {
  it("offers the four channels as compact links with exact hrefs", () => {
    render(<TrainingPage />);
    const links = [
      ["WhatsApp +1 473 420 7747 (opens in a new tab)", WHATSAPP_URL],
      ["Call +1 473 420 7747", PHONE.href],
      [`Instagram ${INSTAGRAM_HANDLE} (opens in a new tab)`, INSTAGRAM_DM_URL],
      ["Email", EMAIL.href],
    ] as const;
    for (const [name, href] of links)
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
  });

  it("opens only WhatsApp and Instagram in a new tab, with noopener", () => {
    render(<TrainingPage />);
    for (const channel of CONTACT_CHANNELS) {
      const link = document.querySelector(`a[href="${channel.href}"]`);
      if (channel.newTab) {
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noopener");
        expect(link?.textContent).toContain("(opens in a new tab)");
      } else {
        expect(link).not.toHaveAttribute("target");
      }
    }
  });

  it("uses the same channel list as the Contact page", () => {
    const { container } = render(<ContactPage />);
    for (const channel of CONTACT_CHANNELS)
      expect(
        container.querySelector(`a[href="${channel.href}"]`)?.textContent
      ).toContain(channel.title);
  });
});

describe("prices", () => {
  it("formats every price with the EC$ prefix", () => {
    expect(formatPrice(120)).toBe("EC$120");
  });

  it("shows EC$ prices on home, services and no bare dollar sign", () => {
    for (const Page of [HomePage, ServicesPage]) {
      const { container, unmount } = render(<Page />);
      expect(container.textContent).toContain(formatPrice(CONSULTATION_PRICE));
      expect(container.textContent).not.toMatch(BARE_DOLLAR);
      unmount();
    }
    const home = render(<HomePage />);
    for (const pkg of PACKAGES)
      expect(home.container.textContent).toContain(formatPrice(pkg.price));
  });
});
