import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "@/components/header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/desktop-nav", () => ({ DesktopNav: () => null }));
vi.mock("@/components/site-search", () => ({ SiteSearch: () => null }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));

const FLEX_CLASS = /(^|\s)flex(\s|$)/;
const HIDDEN_CLASS = /(^|\s)hidden(\s|$)/;

describe("Header", () => {
  it("keeps the bottom tab bar off the website; the menu button opens the drawer", () => {
    render(<Header alerts={{ activeCount: 0, groups: [], status: "ok" }} />);
    expect(
      screen.queryByRole("navigation", { name: "Quick links" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open navigation" })
    ).toBeInTheDocument();
  });

  it("turns the menu button into a close button in place", () => {
    render(<Header alerts={{ activeCount: 0, groups: [], status: "ok" }} />);
    const button = screen.getByRole("button", { name: "Open navigation" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAccessibleName("Close navigation");
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Site menu")).toBeInTheDocument();
  });

  it("shows the alert status in the bar on every width", () => {
    render(<Header alerts={{ activeCount: 0, groups: [], status: "ok" }} />);
    const status = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("href") === "/alerts");
    expect(status?.className).toMatch(FLEX_CLASS);
    expect(status?.className).not.toMatch(HIDDEN_CLASS);
  });
});
