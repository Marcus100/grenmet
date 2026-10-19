import { render, screen, within } from "@testing-library/react";
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

const APPOINTMENT = /appointment/i;
const OLD_LISTING = /True Blue|Fresha/;

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
    expect(booking[0]).toHaveAttribute("href", BOOKING_URL);
    expect(
      screen.getByRole("link", { name: "Leave a Google review" })
    ).toHaveAttribute("href", GOOGLE_REVIEW_URL);
    expect(screen.getByText("Lower Mont Tout")).toBeInTheDocument();
    expect(screen.queryByText(OLD_LISTING)).not.toBeInTheDocument();
    expect(screen.getByText("By appointment only")).toBeInTheDocument();
  });

  it("contact lists hours under By appointment only", () => {
    render(<ContactPage />);
    const table = screen.getByRole("table", { name: "Opening hours" });
    expect(
      within(table).getByRole("rowheader", { name: "Sunday" })
    ).toBeInTheDocument();
    expect(screen.getByText("By appointment only")).toBeInTheDocument();
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
      BOOKING_URL
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
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Services" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    const toggle = screen.getByRole("button", { name: "Open menu" });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("the phone book bar links to booking", () => {
    render(<BookBar />);
    expect(screen.getByRole("link", { name: "Book me" })).toHaveAttribute(
      "href",
      BOOKING_URL
    );
  });
});
