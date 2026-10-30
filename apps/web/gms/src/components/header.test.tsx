import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "@/components/header";
import type { AlertsResult } from "@/lib/cap-alerts";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/desktop-nav", () => ({ DesktopNav: () => null }));
vi.mock("@/components/site-search", () => ({ SiteSearch: () => null }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));

const FLEX_CLASS = /(^|\s)flex(\s|$)/u;
const HIDDEN_CLASS = /(^|\s)hidden(\s|$)/u;
const ONE_ACTIVE = /Take action now · 1 active/u;
const OUTAGE = /We cannot load alerts right now/u;

const ACTIVE: AlertsResult = {
  activeCount: 1,
  groups: [
    {
      alerts: [
        {
          areas: [],
          event: "Flood Warning",
          expires: null,
          headline: "Flooding expected",
          identifier: "a",
          severity: "Severe",
          status: "Actual",
        },
      ],
      name: "Flood",
    },
  ],
  status: "ok",
};

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

describe("Header with a streamed warning feed", () => {
  it("renders at once and says it is checking, never all-clear", () => {
    const pending = new Promise<AlertsResult>(() => undefined);
    render(<Header alerts={pending} />);
    expect(
      screen.getByRole("button", { name: "Open navigation" })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Checking warnings…")).toHaveLength(2);
    expect(screen.queryByText("No active alerts")).not.toBeInTheDocument();
    expect(screen.queryByText("View alerts")).not.toBeInTheDocument();
  });

  it("swaps in the feed's answer when it arrives", async () => {
    const alerts = Promise.resolve(ACTIVE);
    await act(() => {
      render(<Header alerts={alerts} />);
    });
    expect(await screen.findByText("View alerts")).toBeInTheDocument();
    expect(screen.getAllByText(ONE_ACTIVE).length).toBeGreaterThan(0);
    expect(screen.queryByText("Checking warnings…")).not.toBeInTheDocument();
  });

  it("keeps the outage wording when the feed is unavailable", async () => {
    const alerts = Promise.resolve<AlertsResult>({ status: "unavailable" });
    await act(() => {
      render(<Header alerts={alerts} />);
    });
    expect(await screen.findByText(OUTAGE)).toBeInTheDocument();
    expect(screen.getAllByText("Alerts unavailable").length).toBeGreaterThan(0);
  });
});
