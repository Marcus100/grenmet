import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/studio/sea-salt/agenda" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import { StudioSidebarNav, StudioTabBar, studioNavItems } from "./studio-nav";

const AGENDA_LINK = /^Agenda/u;
const WAITING = /2 waiting to be confirmed/u;
const ALL = { canCreate: true, canPlan: true, orgSlug: "sea-salt" };

describe("studioNavItems", () => {
  it("links every studio route for an owner or admin", () => {
    const hrefs = studioNavItems("/studio/sea-salt/agenda", ALL).map(
      (item) => item.href
    );
    expect(hrefs).toEqual([
      "/studio/sea-salt/agenda",
      "/studio/sea-salt/bookings/new",
      "/studio/sea-salt/services",
      "/studio/sea-salt/people",
      "/studio/sea-salt/plan",
      "/studio/sea-salt/settings",
    ]);
  });

  it("leaves New booking and Plan & billing out for a member", () => {
    const labels = studioNavItems("/studio/sea-salt/agenda", {
      orgSlug: "sea-salt",
    }).map((item) => item.label);
    expect(labels).toEqual(["Agenda", "Services", "People", "Settings"]);
  });

  it.each([
    ["/studio/sea-salt/agenda", "Agenda"],
    ["/studio/sea-salt/bookings/abc", "Agenda"],
    ["/studio/sea-salt/bookings/new", "New booking"],
    ["/studio/sea-salt/services", "Services"],
    ["/studio/sea-salt/people", "People"],
    ["/studio/sea-salt/plan", "Plan & billing"],
    ["/studio/sea-salt/settings", "Settings"],
  ])("marks one item current on %s", (path, label) => {
    const current = studioNavItems(path, ALL)
      .filter((item) => item.active)
      .map((item) => item.label);
    expect(current).toEqual([label]);
  });

  it("puts the waiting count on Agenda only when there is one", () => {
    const agenda = (pendingCount: number | null) =>
      studioNavItems("/studio/sea-salt/people", {
        ...ALL,
        pendingCount,
      })[0];
    expect(agenda(3)?.badge).toBe(3);
    expect(agenda(0)?.badge).toBeUndefined();
    expect(agenda(null)?.badge).toBeUndefined();
  });
});

describe("studio sidebar", () => {
  it("is a labelled landmark with the current page marked", () => {
    pathname.value = "/studio/sea-salt/people";
    render(<StudioSidebarNav {...ALL} />);
    const nav = screen.getByRole("navigation", { name: "Studio" });
    expect(within(nav).getByRole("link", { name: "People" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(
      within(nav).getByRole("link", { name: "Settings" })
    ).not.toHaveAttribute("aria-current");
  });

  it("says how many bookings are waiting, in words and as a number", () => {
    pathname.value = "/studio/sea-salt/agenda";
    render(<StudioSidebarNav {...ALL} pendingCount={2} />);
    const link = screen.getByRole("link", { name: AGENDA_LINK });
    expect(link).toHaveTextContent("2");
    expect(link).toHaveAccessibleName(WAITING);
  });
});

describe("studio tab bar", () => {
  it("shows Agenda, Services, People and More, and no more than four", () => {
    pathname.value = "/studio/sea-salt/agenda";
    render(<StudioTabBar {...ALL} footer={null} />);
    const nav = screen.getByRole("navigation", { name: "Studio tabs" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Agenda",
      "Services",
      "People",
    ]);
    expect(within(nav).getByRole("button", { name: "More" })).toBeVisible();
    expect(links[0]).toHaveAttribute("aria-current", "page");
  });

  it("lists the rest, and the footer, under More", () => {
    pathname.value = "/studio/sea-salt/settings";
    render(<StudioTabBar {...ALL} footer={<a href="/x">Footer link</a>} />);
    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("navigation", { name: "More" });
    expect(
      within(panel)
        .getAllByRole("link")
        .map((link) => link.textContent)
    ).toEqual(["New booking", "Plan & billing", "Settings"]);
    expect(
      within(panel).getByRole("link", { name: "Settings" })
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Footer link")).toBeInTheDocument();
  });

  it("puts the More panel after the tabs, so keyboard order follows", () => {
    pathname.value = "/studio/sea-salt/agenda";
    render(<StudioTabBar {...ALL} footer={null} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    const tabs = screen.getByRole("navigation", { name: "Studio tabs" });
    const panel = screen.getByRole("navigation", { name: "More" });
    // The panel follows the tabs in the DOM (CSS places it above them).
    const order = [tabs, panel].sort((x, y) =>
      x.compareDocumentPosition(y) === Node.DOCUMENT_POSITION_FOLLOWING ||
      x.compareDocumentPosition(y) ===
        Node.DOCUMENT_POSITION_FOLLOWING + Node.DOCUMENT_POSITION_CONTAINED_BY
        ? -1
        : 1
    );
    expect(order[0]).toBe(tabs);
  });

  it("closes on Escape and returns focus to More", () => {
    pathname.value = "/studio/sea-salt/agenda";
    render(<StudioTabBar {...ALL} footer={null} />);
    const more = screen.getByRole("button", { name: "More" });
    fireEvent.click(more);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "More" })).toBeNull();
    expect(more).toHaveFocus();
  });

  it("closes on an outside tap", () => {
    pathname.value = "/studio/sea-salt/agenda";
    render(<StudioTabBar {...ALL} footer={null} />);
    const more = screen.getByRole("button", { name: "More" });
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Close menu" })).toBeNull();
  });

  it("closes when the page changes", () => {
    pathname.value = "/studio/sea-salt/agenda";
    const { rerender } = render(<StudioTabBar {...ALL} footer={null} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("navigation", { name: "More" })).toBeVisible();
    pathname.value = "/studio/sea-salt/settings";
    rerender(<StudioTabBar {...ALL} footer={null} />);
    expect(screen.queryByRole("navigation", { name: "More" })).toBeNull();
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });
});
