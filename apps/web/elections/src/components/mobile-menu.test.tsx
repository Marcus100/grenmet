import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileMenu } from "@/components/mobile-menu";

vi.mock("next/navigation", () => ({
  usePathname: () => "/trends",
  useRouter: () => ({ push: vi.fn() }),
}));

describe("MobileMenu", () => {
  it("turns the hamburger into a close button that controls the menu", () => {
    render(<MobileMenu status="Election date due 4 October 2026" />);
    const button = screen.getByRole("button", { name: "Open menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "site-menu");

    fireEvent.click(button);
    expect(button).toHaveAccessibleName("Close menu");
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("dialog", { name: "Site menu" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Election date due 4 October 2026")
    ).toBeInTheDocument();
  });

  it("lists every page, marking the current one", () => {
    render(<MobileMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    for (const label of [
      "Election 2026",
      "Candidates",
      "Forecast",
      "Make your map",
      "Results",
      "Constituencies",
      "Sources",
    ])
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trends" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("sets section pages a level below the main rows", () => {
    render(<MobileMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("link", { name: "Election 2026" })).toHaveClass(
      "font-serif"
    );
    expect(screen.getByRole("heading", { name: "Learn" })).toHaveClass(
      "font-serif"
    );
    const sub = screen.getByRole("link", { name: "Trends" });
    expect(sub).not.toHaveClass("font-serif");
    expect(sub).toHaveClass("ml-4", "border-l-2");
  });

  it("closes on Escape and returns focus to the menu button", () => {
    render(<MobileMenu />);
    const button = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
  });
});
