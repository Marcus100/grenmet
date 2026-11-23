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
  GOOGLE_REVIEW_URL,
  PORTFOLIO,
  SERVICE_MENU,
} from "@/data/site";
import { bookingLink, siteBookingLink } from "@/lib/book-link";

const APPOINTMENT = /appointment/iu;
const BOOK_ONLINE = /Book online/u;
const APPOINTMENT_NOTE =
  "Book online and choose a time that suits you. Walk-ins can't be seen.";
// Clock times, day names and the words that used to head the hours table.
const HOURS_TEXT =
  /\d{1,2}(:\d{2})? ?[ap]m|\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Opening|hours|Closed)\b/iu;
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
