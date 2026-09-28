import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { WarningRibbon } from "@/components/warning-ribbon";
import type { AlertsResult } from "@/lib/cap";

const route = vi.hoisted(() => ({ pathname: "/warnings" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

const NOT_ALL_CLEAR = /does not mean there are no warnings/i;
const WARNINGS_TAB = /Warnings/;

const NONE: AlertsResult = { activeCount: 0, groups: [], status: "ok" };
const SEVERE: AlertsResult = {
  activeCount: 1,
  groups: [
    {
      alerts: [
        {
          areas: [],
          event: "Hurricane Warning",
          expires: null,
          headline: "Hurricane conditions expected",
          identifier: "a",
          severity: "Extreme",
          status: "Actual",
        },
      ],
      name: "Tropical Cyclone",
    },
  ],
  status: "ok",
};

describe("WarningRibbon", () => {
  it("stays silent when nothing is in effect", () => {
    const { container } = render(<WarningRibbon alerts={NONE} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the level and links to the warnings page", () => {
    render(<WarningRibbon alerts={SEVERE} />);
    expect(screen.getByText("Take action now · 1 active")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/warnings");
  });

  it("never presents an outage as an all-clear", () => {
    render(<WarningRibbon alerts={{ status: "unavailable" }} />);
    expect(screen.getByText("Warnings unavailable")).toBeInTheDocument();
    expect(screen.getByText(NOT_ALL_CLEAR)).toBeInTheDocument();
  });
});

describe("MobileTabBar", () => {
  it("marks the current tab and states the warning level in words", () => {
    render(<MobileTabBar alerts={SEVERE} onOpenMenu={() => undefined} />);
    const warnings = screen.getByRole("link", { name: WARNINGS_TAB });
    expect(warnings).toHaveAttribute("aria-current", "page");
    expect(warnings).toHaveTextContent("Take action now · 1 active");
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("adds no status text when nothing is in effect", () => {
    render(<MobileTabBar alerts={NONE} onOpenMenu={() => undefined} />);
    expect(screen.getByRole("link", { name: "Warnings" })).toBeInTheDocument();
  });

  it("opens the menu from the Menu tab", async () => {
    const onOpenMenu = vi.fn();
    render(<MobileTabBar alerts={NONE} onOpenMenu={onOpenMenu} />);
    await userEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(onOpenMenu).toHaveBeenCalledOnce();
  });
});
