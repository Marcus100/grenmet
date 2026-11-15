// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { siteBookingLink } from "@/lib/book-link";
import { SiteHeader } from "./site-header";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const HEAD_BOOK = /Book now/u;

function openMenu() {
  const toggle = screen.getByRole("button", { name: "Open menu" });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  return toggle;
}

describe("SiteHeader phone menu", () => {
  it("closes on Escape and returns focus to the menu button", () => {
    render(<SiteHeader booking={siteBookingLink()} />);
    const toggle = openMenu();
    const menu = screen.getByRole("navigation", { name: "Main" });
    const firstLink = within(menu).getAllByRole("link")[0];
    if (!firstLink) throw new Error("the menu has links");
    firstLink.focus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("closes on Escape without moving focus when focus was elsewhere", () => {
    render(<SiteHeader booking={siteBookingLink()} />);
    const toggle = openMenu();
    const headBook = screen.getByRole("link", { name: HEAD_BOOK });
    headBook.focus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(headBook).toHaveFocus();
  });

  it("ignores other keys", () => {
    render(<SiteHeader booking={siteBookingLink()} />);
    const toggle = openMenu();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
